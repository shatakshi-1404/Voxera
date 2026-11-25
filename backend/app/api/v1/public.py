"""Customer-facing endpoints (chat widget). Separate token type from staff; scoped to ONE conversation."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.conversations import serve_ws
from app.conversations import service
from app.core.db import get_db
from app.core.ratelimit import rate_limit
from app.core.security import make_token
from app.deps import CustomerSession, customer_from_token, customer_session
from app.events import emit
from app.models import Conversation, Customer, Feedback, Message, Organization
from app.utils import row
from app.core.config import settings

router = APIRouter(prefix="/public", tags=["public-chat"])


class StartIn(BaseModel):
    email: EmailStr | None = None
    language: str = "en"


class SayIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


@router.post("/{org_slug}/conversations", dependencies=[Depends(rate_limit(10, 60))])
async def start(org_slug: str, body: StartIn, db: AsyncSession = Depends(get_db)):
    org = (await db.execute(select(Organization).where(Organization.slug == org_slug))).scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Unknown organization")
    cust = None
    if body.email:  # a *claimed* identity: stays a candidate until verified (last-4 of registered phone)
        cust = (await db.execute(select(Customer).where(Customer.org_id == org.id, Customer.email == body.email.lower()))).scalar_one_or_none()
    conv = await service.create_conversation(db, org.id, "chat", cust, body.language)
    await db.commit()
    token = make_token({"conv": str(conv.id), "org": str(org.id), "typ": "customer"}, settings.customer_token_minutes)
    return {"conversation_id": str(conv.id), "token": token}


@router.post("/conversations/{conv_id}/messages", dependencies=[Depends(rate_limit(40, 60))])
async def say(conv_id: uuid.UUID, body: SayIn, s: CustomerSession = Depends(customer_session), db: AsyncSession = Depends(get_db)):
    if s.conversation_id != conv_id:
        raise HTTPException(403, "Forbidden")
    conv = await db.get(Conversation, conv_id)
    return await service.handle_customer_message(db, conv, body.content)


@router.get("/conversations/{conv_id}/messages")
async def history(conv_id: uuid.UUID, s: CustomerSession = Depends(customer_session), db: AsyncSession = Depends(get_db)):
    if s.conversation_id != conv_id:
        raise HTTPException(403, "Forbidden")
    msgs = (await db.execute(select(Message).where(Message.conversation_id == conv_id, Message.role != "note")
                             .order_by(Message.created_at))).scalars().all()
    return [row(m, exclude=("embedding", "meta", "sender_user_id")) for m in msgs]


@router.post("/conversations/{conv_id}/feedback")
async def feedback(conv_id: uuid.UUID, body: FeedbackIn, s: CustomerSession = Depends(customer_session), db: AsyncSession = Depends(get_db)):
    if s.conversation_id != conv_id:
        raise HTTPException(403, "Forbidden")
    conv = await db.get(Conversation, conv_id)
    db.add(Feedback(org_id=conv.org_id, conversation_id=conv_id, customer_id=conv.customer_id, rating=body.rating, comment=body.comment))
    await emit(db, conv.org_id, conv_id, "feedback.received", {"rating": body.rating})
    await db.commit()
    return {"ok": True}


@router.websocket("/conversations/{conv_id}/stream")
async def stream(ws: WebSocket, conv_id: uuid.UUID, token: str):
    try:
        s = customer_from_token(token)
        assert s.conversation_id == conv_id
    except Exception:
        await ws.close(code=4401)
        return
    await ws.accept()
    await serve_ws(ws, f"conv:{conv_id}")
