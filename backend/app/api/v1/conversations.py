import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations import service
from app.core.db import SessionLocal, get_db
from app.deps import ALL_STAFF, OPERATORS, Principal, principal_from_token, require
from app.events import emit, hub
from app.models import Conversation, Customer, Escalation, Message, Ticket, now
from app.tools.support_tools import create_support_ticket, escalate_conversation
from app.utils import initials, row

router = APIRouter(tags=["conversations"])


class ConversationIn(BaseModel):
    customer_id: uuid.UUID | None = None
    channel: str = "chat"
    language: str = "en"
    is_test: bool = False


class MessageIn(BaseModel):
    content: str
    sender: str = "agent"  # agent | customer (simulate) | note


class AssignIn(BaseModel):
    user_id: uuid.UUID | None


async def get_conv(db, p: Principal, conv_id) -> Conversation:
    c = await db.get(Conversation, conv_id)
    if not c or c.org_id != p.org_id:
        raise HTTPException(404, "Conversation not found")
    return c


async def conv_card(db, c: Conversation) -> dict:
    d = row(c)
    cust = await db.get(Customer, c.customer_id or c.candidate_customer_id) if (c.customer_id or c.candidate_customer_id) else None
    d["customer"] = {"id": str(cust.id), "name": cust.name, "initials": initials(cust.name)} if cust else None
    last = (await db.execute(select(Message).where(Message.conversation_id == c.id, Message.role != "note")
                             .order_by(Message.created_at.desc()).limit(1))).scalar_one_or_none()
    d["preview"] = last.content[:140] if last else None
    d["ownership"] = "human" if c.handler == "human" else "ai"
    return d


@router.post("/conversations")
async def create(body: ConversationIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    cust = None
    if body.customer_id:
        cust = await db.get(Customer, body.customer_id)
        if not cust or cust.org_id != p.org_id:
            raise HTTPException(404, "Customer not found")
    conv = await service.create_conversation(db, p.org_id, body.channel, cust, body.language, body.is_test)
    await db.commit()
    return row(conv)


@router.get("/conversations")
async def list_conversations(status: str | None = None, handler: str | None = None, channel: str | None = None,
                             assigned_to: uuid.UUID | None = None, q: str | None = None, limit: int = Query(50, le=200),
                             offset: int = 0, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    stmt = select(Conversation).where(Conversation.org_id == p.org_id, Conversation.is_test.is_(False))
    if status:
        stmt = stmt.where(Conversation.status == status)
    if handler:
        stmt = stmt.where(Conversation.handler == handler)
    if channel:
        stmt = stmt.where(Conversation.channel == channel)
    if assigned_to:
        stmt = stmt.where(Conversation.assigned_to == assigned_to)
    if q:
        stmt = stmt.where(or_(Conversation.subject.ilike(f"%{q}%"), Conversation.id.in_(
            select(Message.conversation_id).where(Message.org_id == p.org_id, Message.content.ilike(f"%{q}%")))))
    rows = (await db.execute(stmt.order_by(Conversation.last_message_at.desc()).limit(limit).offset(offset))).scalars().all()
    counts = dict((await db.execute(select(Conversation.status, func.count()).where(
        Conversation.org_id == p.org_id, Conversation.is_test.is_(False)).group_by(Conversation.status))).all())
    return {"items": [await conv_card(db, c) for c in rows], "counts": counts}


@router.get("/conversations/{conv_id}")
async def detail(conv_id: uuid.UUID, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, p, conv_id)
    msgs = (await db.execute(select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at))).scalars().all()
    tickets = (await db.execute(select(Ticket).where(Ticket.conversation_id == c.id))).scalars().all()
    esc = (await db.execute(select(Escalation).where(Escalation.conversation_id == c.id))).scalars().all()
    return {**await conv_card(db, c), "messages": [row(m) for m in msgs], "tickets": [row(t) for t in tickets],
            "escalations": [row(e) for e in esc]}


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: uuid.UUID, body: MessageIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, p, conv_id)
    if body.sender == "customer":  # simulated customer (Playground / demos): runs the AI engine
        return await service.handle_customer_message(db, c, body.content)
    if body.sender == "note":
        m = await service.add_message(db, c, "note", body.content, sender_user_id=p.user_id)
        await emit(db, p.org_id, c.id, "note.added", {"message": row(m)})
        await db.commit()
        return row(m)
    if c.handler == "ai":  # human reply implies takeover: the AI must stop answering
        c.handler, c.assigned_to = "human", p.user_id
        if c.status == "open":
            c.status = "waiting"
        await emit(db, p.org_id, c.id, "conversation.takeover", {"by": str(p.user_id)})
    m = await service.add_message(db, c, "agent", body.content, sender_user_id=p.user_id)
    if c.first_response_at is None:
        c.first_response_at = now()
    await emit(db, p.org_id, c.id, "message.sent", {"message": row(m)})
    await db.commit()
    return row(m)


@router.post("/conversations/{conv_id}/takeover")
async def takeover(conv_id: uuid.UUID, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, p, conv_id)
    c.handler, c.assigned_to = "human", p.user_id
    c.status = "waiting" if c.status == "open" else c.status
    for e in (await db.execute(select(Escalation).where(Escalation.conversation_id == c.id, Escalation.status == "pending"))).scalars():
        e.status = "taken"
    sysm = await service.add_message(db, c, "system", "A human agent has joined the conversation.")
    await emit(db, p.org_id, c.id, "conversation.takeover", {"by": str(p.user_id), "message": row(sysm)})
    await db.commit()
    return row(c)


@router.post("/conversations/{conv_id}/release")
async def release(conv_id: uuid.UUID, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    """Explicitly re-enable the AI."""
    c = await get_conv(db, p, conv_id)
    c.handler, c.status = "ai", "open"
    await emit(db, p.org_id, c.id, "conversation.released", {})
    await db.commit()
    return row(c)


@router.post("/conversations/{conv_id}/escalate")
async def escalate(conv_id: uuid.UUID, body: dict | None = None, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, p, conv_id)
    r = await escalate_conversation(db, c, (body or {}).get("reason", "Escalated by staff"), "staff")
    await db.commit()
    return r


@router.post("/conversations/{conv_id}/assign")
async def assign(conv_id: uuid.UUID, body: AssignIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, p, conv_id)
    c.assigned_to = body.user_id
    await emit(db, p.org_id, c.id, "conversation.assigned", {"user_id": str(body.user_id) if body.user_id else None})
    await db.commit()
    return row(c)


@router.post("/conversations/{conv_id}/resolve")
async def resolve(conv_id: uuid.UUID, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, p, conv_id)
    c.status, c.resolved_by, c.resolved_at = "resolved", "human", now()
    await emit(db, p.org_id, c.id, "conversation.resolved", {"by": "human"})
    await db.commit()
    return row(c)


@router.post("/conversations/{conv_id}/tickets")
async def conv_ticket(conv_id: uuid.UUID, body: dict, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    c = await get_conv(db, p, conv_id)
    r = await create_support_ticket(db, p.org_id, c.customer_id or c.candidate_customer_id, body.get("subject", c.subject or "Support request"),
                                    c.id, body.get("priority", "medium"), None, "staff")
    await db.commit()
    return r


# ----- WebSockets -------------------------------------------------------------------------------------
async def pump(ws: WebSocket, channel: str):
    q = hub.subscribe(channel)
    try:
        while True:
            await ws.send_json(await q.get())
    finally:
        hub.unsubscribe(channel, q)


async def serve_ws(ws: WebSocket, channel: str, on_client=None):
    task = asyncio.create_task(pump(ws, channel))
    try:
        while True:
            data = await ws.receive_json()
            if on_client:
                await on_client(data)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        task.cancel()


@router.websocket("/stream")
async def org_stream(ws: WebSocket, token: str):
    """Inbox-wide live updates for the dashboard."""
    try:
        p = principal_from_token(token)
    except HTTPException:
        await ws.close(code=4401)
        return
    await ws.accept()
    await serve_ws(ws, f"org:{p.org_id}")


@router.websocket("/conversations/{conv_id}/stream")
async def conv_stream(ws: WebSocket, conv_id: uuid.UUID, token: str):
    try:
        p = principal_from_token(token)
    except HTTPException:
        await ws.close(code=4401)
        return
    async with SessionLocal() as db:
        c = await db.get(Conversation, conv_id)
        if not c or c.org_id != p.org_id:
            await ws.close(code=4404)
            return
    await ws.accept()

    async def on_client(data):  # staff typing indicator
        if data.get("type") == "typing":
            await hub.publish(f"conv:{conv_id}", {"type": "agent.typing", "conversation_id": str(conv_id), "payload": {"who": "human"}})

    await serve_ws(ws, f"conv:{conv_id}", on_client)
