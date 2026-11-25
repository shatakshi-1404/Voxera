"""Controlled business tools. The LLM never calls these directly: the LangGraph nodes do, and every
tool re-validates tenant, customer ownership, limits and idempotency in the backend."""
import datetime as dt
import logging
import secrets
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.events import emit
from app.models import (Conversation, CustomerIdentity, Escalation, Membership, Order, Refund, Ticket, now)

log = logging.getLogger("voxera.tools")
SLA_HOURS = {"urgent": 1, "high": 4, "medium": 24, "low": 72}


def order_view(o: Order) -> dict:
    s, p = o.shipment, o.payment
    return {
        "order_id": str(o.id), "code": o.code, "status": o.status, "total": float(o.total), "currency": o.currency,
        "placed_at": o.placed_at.date().isoformat(),
        "items": [{"name": i.name, "qty": i.quantity} for i in o.items],
        "shipment": None if not s else {
            "carrier": s.carrier, "tracking_no": s.tracking_no, "status": s.status,
            "expected_delivery": s.expected_delivery.isoformat() if s.expected_delivery else None,
            "last_location": s.last_location, "delay_reason": s.delay_reason,
            "delivered_at": s.delivered_at.date().isoformat() if s.delivered_at else None},
        "payment": None if not p else {"method": p.method, "brand": p.brand, "last4": p.last4, "status": p.status},
    }


async def _owned_order(db, org_id, customer_id, order_id) -> Order | None:
    q = select(Order).where(Order.id == order_id, Order.org_id == org_id, Order.customer_id == customer_id)
    return (await db.execute(q)).scalar_one_or_none()


# ---- customer tools -------------------------------------------------------------------------------------
async def verify_customer_identity(db, conv: Conversation, last4: str) -> dict:
    if conv.verify_attempts >= 3:
        return {"ok": False, "locked": True, "attempts_left": 0}
    if not conv.candidate_customer_id:
        return {"ok": False, "reason": "no_candidate", "attempts_left": 3 - conv.verify_attempts}
    conv.verify_attempts += 1
    idents = (await db.execute(select(CustomerIdentity).where(
        CustomerIdentity.customer_id == conv.candidate_customer_id, CustomerIdentity.org_id == conv.org_id,
        CustomerIdentity.kind == "phone"))).scalars().all()
    ok = any(i.value[-4:] == last4 for i in idents)
    if ok:
        conv.verified, conv.customer_id = True, conv.candidate_customer_id
    log.info("verify conv=%s ok=%s attempt=%s", conv.id, ok, conv.verify_attempts)
    return {"ok": ok, "attempts_left": max(0, 3 - conv.verify_attempts), "locked": conv.verify_attempts >= 3 and not ok}


# ---- order tools ----------------------------------------------------------------------------------------
async def get_customer_orders(db, org_id, customer_id) -> list[dict]:
    q = select(Order).where(Order.org_id == org_id, Order.customer_id == customer_id).order_by(Order.placed_at.desc())
    return [order_view(o) for o in (await db.execute(q)).scalars().all()]


async def get_order_details(db, org_id, customer_id, order_id) -> dict | None:
    o = await _owned_order(db, org_id, customer_id, order_id)
    return order_view(o) if o else None


# ---- refund tools ---------------------------------------------------------------------------------------
async def check_refund_eligibility(db, org_id, customer_id, order_id) -> dict:
    o = await _owned_order(db, org_id, customer_id, order_id)
    if not o:
        return {"eligible": False, "reason": "order_not_found"}
    base = {"order_id": str(o.id), "code": o.code, "amount": float(o.total)}
    existing = (await db.execute(select(Refund).where(Refund.order_id == o.id, Refund.status != "rejected"))).scalars().first()
    if existing:
        return {**base, "eligible": False, "reason": "refund_already_requested", "refund_status": existing.status}
    if o.status in ("cancelled", "refunded"):
        return {**base, "eligible": False, "reason": f"order_{o.status}"}
    if o.status != "delivered":
        return {**base, "eligible": False, "reason": "not_delivered_yet", "can_cancel": o.status == "processing"}
    delivered = o.shipment.delivered_at if o.shipment and o.shipment.delivered_at else o.placed_at
    days = (now() - delivered).days
    if days > settings.return_window_days:
        return {**base, "eligible": False, "reason": "outside_return_window", "days_since_delivery": days,
                "window_days": settings.return_window_days}
    if float(o.total) > settings.auto_refund_limit:
        return {**base, "eligible": False, "reason": "needs_human_review", "days_since_delivery": days}
    return {**base, "eligible": True, "days_since_delivery": days, "window_days": settings.return_window_days}


async def create_refund_request(db, org_id, customer_id, order_id, reason, conversation_id=None, created_by="ai") -> dict:
    """Creates a refund *request* (no money moves). Re-validates eligibility; idempotent per order."""
    key = f"refund:{order_id}"
    existing = (await db.execute(select(Refund).where(Refund.idempotency_key == key))).scalar_one_or_none()
    if existing and existing.status != "rejected":
        return {"created": False, "duplicate": True, "refund_id": str(existing.id), "status": existing.status}
    elig = await check_refund_eligibility(db, org_id, customer_id, order_id)
    if not elig["eligible"]:
        return {"created": False, "reason": elig["reason"], **{k: v for k, v in elig.items() if k != "eligible"}}
    if existing:  # previously rejected -> new request gets a fresh key
        key = f"{key}:{secrets.token_hex(3)}"
    r = Refund(org_id=org_id, order_id=order_id, customer_id=customer_id, conversation_id=conversation_id,
               amount=elig["amount"], reason=reason, idempotency_key=key, created_by=created_by)
    db.add(r)
    await db.flush()
    await emit(db, org_id, conversation_id, "refund.requested", {"refund_id": str(r.id), "order": elig["code"]})
    return {"created": True, "refund_id": str(r.id), "amount": elig["amount"], "code": elig["code"]}


async def cancel_order(db, org_id, customer_id, order_id, conversation_id=None) -> dict:
    o = await _owned_order(db, org_id, customer_id, order_id)
    if not o:
        return {"cancelled": False, "reason": "order_not_found"}
    if o.status != "processing":
        return {"cancelled": False, "reason": f"order_{o.status}", "code": o.code}
    o.status = "cancelled"
    refund = None
    if o.payment and o.payment.status == "paid":
        r = Refund(org_id=org_id, order_id=o.id, customer_id=customer_id, conversation_id=conversation_id,
                   amount=o.total, reason="Order cancelled by customer", idempotency_key=f"cancel:{o.id}")
        db.add(r)
        await db.flush()
        refund = str(r.id)
    return {"cancelled": True, "code": o.code, "refund_id": refund}


# ---- ticket / escalation tools --------------------------------------------------------------------------
async def create_support_ticket(db, org_id, customer_id, issue, conversation_id=None, priority="medium",
                                reason=None, created_by="ai") -> dict:
    if conversation_id:  # idempotency: one open ticket per (conversation, subject)
        dup = (await db.execute(select(Ticket).where(
            Ticket.conversation_id == conversation_id, Ticket.subject == issue[:300],
            Ticket.status.in_(["open", "in_progress", "waiting"])))).scalars().first()
        if dup:
            return {"created": False, "duplicate": True, "ticket_id": str(dup.id), "code": dup.code, "priority": dup.priority}
    t = Ticket(org_id=org_id, code=f"T-{secrets.token_hex(3).upper()}", conversation_id=conversation_id,
               customer_id=customer_id, subject=issue[:300], description=issue, priority=priority,
               sla_due_at=now() + dt.timedelta(hours=SLA_HOURS[priority]), escalation_reason=reason,
               created_by=created_by)
    db.add(t)
    await db.flush()
    await emit(db, org_id, conversation_id, "ticket.created", {"ticket_id": str(t.id), "code": t.code, "priority": priority})
    return {"created": True, "ticket_id": str(t.id), "code": t.code, "priority": priority,
            "sla_hours": SLA_HOURS[priority]}


async def pick_assignee(db, org_id) -> uuid.UUID | None:
    members = (await db.execute(select(Membership).where(
        Membership.org_id == org_id, Membership.available.is_(True), Membership.role.in_(["agent", "manager"])))).scalars().all()
    if not members:
        return None
    load = {}
    for m in members:
        load[m.user_id] = (await db.execute(select(func.count()).select_from(Conversation).where(
            Conversation.assigned_to == m.user_id, Conversation.status.in_(["open", "escalated", "waiting"])))).scalar_one()
    return min(members, key=lambda m: load[m.user_id]).user_id


async def escalate_conversation(db, conv: Conversation, reason: str, triggered_by="ai", priority="high") -> dict:
    existing = (await db.execute(select(Escalation).where(
        Escalation.conversation_id == conv.id, Escalation.status != "resolved"))).scalars().first()
    if existing:
        return {"escalated": True, "duplicate": True, "escalation_id": str(existing.id)}
    ticket = await create_support_ticket(db, conv.org_id, conv.customer_id or conv.candidate_customer_id,
                                         f"Escalation: {reason}", conv.id, priority, reason, triggered_by)
    esc = Escalation(org_id=conv.org_id, conversation_id=conv.id, reason=reason[:300], triggered_by=triggered_by,
                     ticket_id=uuid.UUID(ticket["ticket_id"]))
    db.add(esc)
    conv.status, conv.handler = "escalated", "human"  # AI stops replying until staff releases it
    conv.pending_action = None
    assignee = await pick_assignee(db, conv.org_id)
    if assignee:
        conv.assigned_to = assignee
        t = await db.get(Ticket, uuid.UUID(ticket["ticket_id"]))
        t.assignee_id = assignee
    await db.flush()
    await emit(db, conv.org_id, conv.id, "escalation.requested",
               {"reason": reason, "ticket": ticket["code"], "assigned_to": str(assignee) if assignee else None})
    return {"escalated": True, "escalation_id": str(esc.id), "ticket_code": ticket["code"]}
