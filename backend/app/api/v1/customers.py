import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.deps import ALL_STAFF, OPERATORS, Principal, require
from app.models import (Conversation, Customer, CustomerIdentity, Feedback, Refund, Ticket)
from app.tools.support_tools import get_customer_orders
from app.utils import row

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerIn(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    language: str = "en"
    tags: list[str] = []


@router.get("")
async def list_customers(q: str | None = None, tag: str | None = None, limit: int = Query(50, le=200), offset: int = 0,
                         p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    stmt = select(Customer).where(Customer.org_id == p.org_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.email.ilike(like), Customer.phone.ilike(like)))
    rows = (await db.execute(stmt.order_by(Customer.last_interaction_at.desc().nullslast()).limit(limit).offset(offset))).scalars().all()
    out = [row(c) for c in rows]
    return [c for c in out if not tag or tag in (c["tags"] or [])]


@router.post("")
async def create_customer(body: CustomerIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    c = Customer(org_id=p.org_id, **body.model_dump(exclude={"phone"}), phone=body.phone)
    db.add(c)
    await db.flush()
    db.add(CustomerIdentity(org_id=p.org_id, customer_id=c.id, kind="email", value=body.email.lower()))
    if body.phone:
        db.add(CustomerIdentity(org_id=p.org_id, customer_id=c.id, kind="phone", value=body.phone))
    await db.commit()
    return row(c)


async def _get(db, p, customer_id) -> Customer:
    c = await db.get(Customer, customer_id)
    if not c or c.org_id != p.org_id:
        raise HTTPException(404, "Customer not found")
    return c


def _mask_phone(ph):
    return f"******{ph[-4:]}" if ph else None


@router.get("/{customer_id}")
async def get_customer(customer_id: uuid.UUID, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    c = await _get(db, p, customer_id)
    d = row(c)
    d["phone"] = _mask_phone(c.phone)
    orders = await get_customer_orders(db, p.org_id, c.id)
    tickets = (await db.execute(select(Ticket).where(Ticket.customer_id == c.id, Ticket.org_id == p.org_id))).scalars().all()
    d["stats"] = {"orders": len(orders), "open_tickets": sum(1 for t in tickets if t.status in ("open", "in_progress", "waiting"))}
    return d


@router.get("/{customer_id}/orders")
async def customer_orders(customer_id: uuid.UUID, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    c = await _get(db, p, customer_id)
    return await get_customer_orders(db, p.org_id, c.id)


@router.get("/{customer_id}/timeline")
async def timeline(customer_id: uuid.UUID, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    c = await _get(db, p, customer_id)
    ev = []
    for x in (await db.execute(select(Conversation).where(Conversation.customer_id == c.id, Conversation.org_id == p.org_id))).scalars():
        ev.append({"kind": "conversation", "at": x.created_at, "title": x.subject or "Conversation", "status": x.status, "channel": x.channel, "id": str(x.id)})
    for x in (await db.execute(select(Ticket).where(Ticket.customer_id == c.id, Ticket.org_id == p.org_id))).scalars():
        ev.append({"kind": "ticket", "at": x.created_at, "title": f"{x.code}: {x.subject}", "status": x.status, "id": str(x.id)})
    for x in (await db.execute(select(Refund).where(Refund.customer_id == c.id, Refund.org_id == p.org_id))).scalars():
        ev.append({"kind": "refund", "at": x.created_at, "title": f"Refund {float(x.amount):.0f}", "status": x.status, "id": str(x.id)})
    for x in (await db.execute(select(Feedback).where(Feedback.customer_id == c.id, Feedback.org_id == p.org_id))).scalars():
        ev.append({"kind": "feedback", "at": x.created_at, "title": f"CSAT {x.rating}/5", "id": str(x.id)})
    ev.sort(key=lambda e: e["at"], reverse=True)
    for e in ev:
        e["at"] = e["at"].isoformat()
    return ev
