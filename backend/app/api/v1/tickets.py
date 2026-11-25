import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.deps import ALL_STAFF, OPERATORS, Principal, require
from app.events import emit
from app.models import Refund, Ticket, now
from app.tools import support_tools as tools
from app.utils import row

router = APIRouter(tags=["tickets"])


class TicketIn(BaseModel):
    subject: str
    description: str | None = None
    priority: str = "medium"
    customer_id: uuid.UUID | None = None
    conversation_id: uuid.UUID | None = None


class TicketPatch(BaseModel):
    priority: str | None = None
    status: str | None = None
    assignee_id: uuid.UUID | None = None
    team: str | None = None
    resolution_note: str | None = None


def _view(t: Ticket) -> dict:
    d = row(t)
    if t.sla_due_at and t.status in ("open", "in_progress", "waiting"):
        left = (t.sla_due_at - now()).total_seconds()
        d["sla_seconds_left"], d["sla_breached"] = int(left), left < 0
    return d


@router.post("/tickets")
async def create(body: TicketIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    if body.priority not in tools.SLA_HOURS:
        raise HTTPException(400, "Invalid priority")
    r = await tools.create_support_ticket(db, p.org_id, body.customer_id, body.subject, body.conversation_id, body.priority, None, "staff")
    if body.description:
        t = await db.get(Ticket, uuid.UUID(r["ticket_id"]))
        t.description = body.description
    await db.commit()
    return r


@router.get("/tickets")
async def list_tickets(status: str | None = None, priority: str | None = None, assignee_id: uuid.UUID | None = None,
                       p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    stmt = select(Ticket).where(Ticket.org_id == p.org_id)
    if status:
        stmt = stmt.where(Ticket.status == status)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    if assignee_id:
        stmt = stmt.where(Ticket.assignee_id == assignee_id)
    return [_view(t) for t in (await db.execute(stmt.order_by(Ticket.created_at.desc()).limit(200))).scalars()]


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: uuid.UUID, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    t = await db.get(Ticket, ticket_id)
    if not t or t.org_id != p.org_id:
        raise HTTPException(404)
    return _view(t)


@router.patch("/tickets/{ticket_id}")
async def patch(ticket_id: uuid.UUID, body: TicketPatch, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    t = await db.get(Ticket, ticket_id)
    if not t or t.org_id != p.org_id:
        raise HTTPException(404)
    data = body.model_dump(exclude_unset=True)
    if "priority" in data:
        if data["priority"] not in tools.SLA_HOURS:
            raise HTTPException(400, "Invalid priority")
        t.sla_due_at = t.created_at + dt.timedelta(hours=tools.SLA_HOURS[data["priority"]])
    for k, v in data.items():
        setattr(t, k, v)
    if data.get("status") in ("resolved", "closed") and not t.resolved_at:
        t.resolved_at = now()
    await emit(db, p.org_id, t.conversation_id, "ticket.updated", {"ticket_id": str(t.id), **{k: str(v) for k, v in data.items()}})
    await db.commit()
    return _view(t)


# ----- refunds ----------------------------------------------------------------------------------------
refunds = APIRouter(prefix="/refunds", tags=["refunds"])


class RefundIn(BaseModel):
    customer_id: uuid.UUID
    order_id: uuid.UUID
    reason: str
    conversation_id: uuid.UUID | None = None


@refunds.post("/requests")
async def create_refund(body: RefundIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    r = await tools.create_refund_request(db, p.org_id, body.customer_id, body.order_id, body.reason, body.conversation_id, "staff")
    await db.commit()
    if not r.get("created") and not r.get("duplicate"):
        raise HTTPException(422, r)
    return r


@refunds.get("")
async def list_refunds(status: str | None = None, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    stmt = select(Refund).where(Refund.org_id == p.org_id)
    if status:
        stmt = stmt.where(Refund.status == status)
    return [row(r) for r in (await db.execute(stmt.order_by(Refund.created_at.desc()).limit(200))).scalars()]


@refunds.patch("/{refund_id}")
async def decide(refund_id: uuid.UUID, body: dict, p: Principal = Depends(require("owner", "admin", "manager")), db: AsyncSession = Depends(get_db)):
    r = await db.get(Refund, refund_id)
    if not r or r.org_id != p.org_id:
        raise HTTPException(404)
    if body.get("status") not in ("approved", "rejected"):
        raise HTTPException(400, "status must be approved or rejected")
    r.status = body["status"]
    await emit(db, p.org_id, r.conversation_id, "refund.decided", {"refund_id": str(r.id), "status": r.status})
    await db.commit()
    return row(r)
