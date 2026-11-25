"""Channel-independent conversation engine: chat and voice both land in handle_customer_message()."""
import logging
import time
import uuid

from sqlalchemy import select

from app.agents.graph import DEFAULT_PROMPT, run_agent
from app.events import emit
from app.models import AgentConfig, Conversation, Customer, Message, now
from app.tools.support_tools import escalate_conversation
from app.utils import row

log = logging.getLogger("voxera.conv")


async def get_agent_cfg(db, org_id) -> dict:
    a = (await db.execute(select(AgentConfig).where(AgentConfig.org_id == org_id))).scalars().first()
    if not a:
        return {"system_prompt": DEFAULT_PROMPT}
    return {"system_prompt": a.system_prompt, "model": a.model, "temperature": a.temperature}


async def create_conversation(db, org_id, channel="chat", customer: Customer | None = None, language="en",
                              is_test=False, subject=None) -> Conversation:
    conv = Conversation(org_id=org_id, channel=channel, language=language, is_test=is_test, subject=subject,
                        candidate_customer_id=customer.id if customer else None)
    db.add(conv)
    await db.flush()
    await emit(db, org_id, conv.id, "conversation.created", {"channel": channel})
    return conv


async def _history(db, conv_id, limit=12) -> list[dict]:
    q = select(Message).where(Message.conversation_id == conv_id).order_by(Message.created_at.desc()).limit(limit)
    msgs = list((await db.execute(q)).scalars().all())[::-1]
    return [{"role": m.role, "content": m.content} for m in msgs]


async def add_message(db, conv: Conversation, role: str, content: str, channel: str | None = None,
                      sender_user_id=None, meta: dict | None = None) -> Message:
    m = Message(org_id=conv.org_id, conversation_id=conv.id, role=role, content=content, channel=channel or conv.channel,
                sender_user_id=sender_user_id, meta=meta or {})
    db.add(m)
    conv.last_message_at = now()
    if not conv.subject and role == "customer":
        conv.subject = content[:120]
    await db.flush()
    return m


async def handle_customer_message(db, conv: Conversation, text: str, channel: str | None = None, meta=None,
                                  cfg_override: dict | None = None) -> dict:
    channel = channel or conv.channel
    t0 = time.perf_counter()
    cust_msg = await add_message(db, conv, "customer", text, channel, meta=meta)
    await emit(db, conv.org_id, conv.id, "message.received", {"message": row(cust_msg)})
    if conv.status == "resolved":  # customer came back: reopen
        conv.status, conv.resolved_at, conv.resolved_by = "open", None, None
    if conv.handler == "human":
        await db.commit()
        return {"customer_message": row(cust_msg), "reply": None, "handled_by": "human"}

    await emit(db, conv.org_id, conv.id, "agent.typing", {"who": "ai"})
    await emit(db, conv.org_id, conv.id, "agent.response.started", {})
    history = (await _history(db, conv.id))[:-1]  # exclude the message we just stored
    cfg = {**await get_agent_cfg(db, conv.org_id), **(cfg_override or {})}
    state, last_err = None, None
    for attempt in range(2):  # retry once on transient failure
        try:
            state = await run_agent(db, conv, text, channel, history, cfg)
            break
        except Exception as e:
            last_err = e
            log.exception("agent failed (attempt %s)", attempt + 1)
    if state is None:
        await escalate_conversation(db, conv, f"AI failure: {type(last_err).__name__}", "rule")
        reply, state = "I'm sorry, I'm having trouble right now. I've asked a human agent to help you.", {}
    else:
        reply = state["response"]

    conv.language = state.get("language", conv.language)
    conv.sentiment = state.get("sentiment", conv.sentiment)
    if state.get("detected_intent") in ("order_status", "refund_request", "cancel_order", "payment_issue", "policy_question", "human_request"):
        conv.last_intent = state["detected_intent"]
    ai_msg = await add_message(db, conv, "ai", reply, channel, meta={
        "intent": state.get("detected_intent"), "tools": state.get("tool_results", []),
        "citations": [{"title": d["title"], "chunk_id": d["chunk_id"], "score": d["score"]} for d in state.get("retrieved_documents", [])],
        "latency_ms": int((time.perf_counter() - t0) * 1000)})
    if conv.first_response_at is None:
        conv.first_response_at = now()
    if conv.customer_id:
        c = await db.get(Customer, conv.customer_id)
        if c:
            c.last_interaction_at, c.sentiment = now(), conv.sentiment
    resolved = False
    if state.get("resolution_status") == "resolved" and conv.handler == "ai" and conv.status != "escalated":
        conv.status, conv.resolved_by, conv.resolved_at, resolved = "resolved", "ai", now(), True
        await emit(db, conv.org_id, conv.id, "conversation.resolved", {"by": "ai"})
    await emit(db, conv.org_id, conv.id, "agent.response.completed", {"message": row(ai_msg)})
    await emit(db, conv.org_id, conv.id, "message.sent", {"message": row(ai_msg)})
    await db.commit()
    return {"customer_message": row(cust_msg), "reply": row(ai_msg), "handled_by": conv.handler, "resolved": resolved,
            "escalated": bool(state.get("escalated")), "language": conv.language,
            "latency_ms": ai_msg.meta.get("latency_ms")}
