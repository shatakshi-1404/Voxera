"""AI Configuration + Playground."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import DEFAULT_PROMPT
from app.conversations import service
from app.core.db import get_db
from app.deps import ADMINS, ALL_STAFF, OPERATORS, Principal, require
from app.models import AgentConfig, Customer, Message, now
from app.utils import row

router = APIRouter(tags=["ai"])

SCENARIOS = [
    {"id": "delayed_order", "name": "Delayed order", "messages": ["Where is my order? It was supposed to arrive already.", "{last4}", "yes please"]},
    {"id": "refund", "name": "Refund request", "messages": ["I want a refund for my last delivered order", "{last4}", "yes"]},
    {"id": "failed_payment", "name": "Failed payment", "messages": ["My payment failed but money got deducted", "{last4}"]},
    {"id": "return", "name": "Product return", "messages": ["Can I return my product after 15 days?"]},
    {"id": "cancel", "name": "Cancel order", "messages": ["Please cancel my order", "{last4}", "yes"]},
    {"id": "angry", "name": "Angry customer", "messages": ["This is unacceptable, your service is the worst!"]},
    {"id": "unknown", "name": "Unknown question", "messages": ["Do you sell gift cards for international customers in Brazil?"]},
    {"id": "hinglish", "name": "Hinglish order query", "messages": ["Mera order abhi tak deliver nahi hua", "{last4}"]},
]


class AgentIn(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    temperature: float | None = None
    languages: list[str] | None = None
    voice: dict | None = None
    escalation_rules: dict | None = None
    tools_enabled: list[str] | None = None


@router.get("/agent")
async def get_agent(p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    a = (await db.execute(select(AgentConfig).where(AgentConfig.org_id == p.org_id))).scalars().first()
    return row(a) if a else {"system_prompt": DEFAULT_PROMPT}


@router.put("/agent")
async def put_agent(body: AgentIn, p: Principal = Depends(require(*ADMINS)), db: AsyncSession = Depends(get_db)):
    a = (await db.execute(select(AgentConfig).where(AgentConfig.org_id == p.org_id))).scalars().first()
    if not a:
        a = AgentConfig(org_id=p.org_id, system_prompt=DEFAULT_PROMPT)
        db.add(a)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    a.updated_at = now()
    await db.commit()
    return row(a)


@router.get("/playground/scenarios")
async def scenarios(p: Principal = Depends(require(*ALL_STAFF))):
    return SCENARIOS


class PlayIn(BaseModel):
    message: str
    conversation_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    channel: str = "chat"
    system_prompt: str | None = None  # overrides, not persisted
    model: str | None = None
    temperature: float | None = None


@router.post("/playground/chat")
async def play(body: PlayIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    """Runs the *real* engine on a test conversation (excluded from analytics) with optional config overrides."""
    if body.conversation_id:
        conv = await db.get(service.Conversation, body.conversation_id)
        if not conv or conv.org_id != p.org_id or not conv.is_test:
            raise HTTPException(404)
    else:
        cust = await db.get(Customer, body.customer_id) if body.customer_id else None
        conv = await service.create_conversation(db, p.org_id, body.channel, cust, is_test=True)
    overrides = {k: v for k, v in {"system_prompt": body.system_prompt, "model": body.model, "temperature": body.temperature}.items() if v is not None}
    res = await service.handle_customer_message(db, conv, body.message, body.channel, cfg_override=overrides)
    msgs = (await db.execute(select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at))).scalars().all()
    return {"conversation_id": str(conv.id), **res, "messages": [row(m) for m in msgs]}
