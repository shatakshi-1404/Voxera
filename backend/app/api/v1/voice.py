"""Voice: LiveKit is only the audio transport. All AI logic stays here, shared with chat via
conversations.service.handle_customer_message. The LiveKit agent worker (voice_worker.py) calls /voice/internal/turn."""
import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import llm
from app.conversations import service
from app.core.config import settings
from app.core.db import get_db
from app.deps import ALL_STAFF, OPERATORS, Principal, require
from app.events import emit
from app.models import Conversation, Customer, Message, VoiceSegment, VoiceSession, now
from app.utils import row
from app.voice.livekit_tokens import make_livekit_token

router = APIRouter(prefix="/voice", tags=["voice"])


class SessionIn(BaseModel):
    customer_id: uuid.UUID | None = None
    language: str = "en"


@router.post("/sessions")
async def create_session(body: SessionIn, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    if not (settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret):
        raise HTTPException(503, "LiveKit is not configured (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET)")
    cust = None
    if body.customer_id:
        cust = await db.get(Customer, body.customer_id)
        if not cust or cust.org_id != p.org_id:
            raise HTTPException(404, "Customer not found")
    conv = await service.create_conversation(db, p.org_id, "voice", cust, body.language)
    vs = VoiceSession(org_id=p.org_id, conversation_id=conv.id, room_name=f"voxera-{uuid.uuid4().hex[:12]}", language=body.language)
    db.add(vs)
    await db.flush()
    await emit(db, p.org_id, conv.id, "voice.started", {"voice_session_id": str(vs.id)})
    await db.commit()
    return {"voice_session": row(vs), "conversation_id": str(conv.id), "livekit_url": settings.livekit_url,
            "token": make_livekit_token(vs.room_name, f"staff-{p.user_id}", "Customer (simulated)")}


@router.post("/sessions/{sid}/end")
async def end_session(sid: uuid.UUID, p: Principal = Depends(require(*OPERATORS)), db: AsyncSession = Depends(get_db)):
    vs = await db.get(VoiceSession, sid)
    if not vs or vs.org_id != p.org_id:
        raise HTTPException(404)
    if vs.status == "ended":
        return row(vs)
    vs.status, vs.ended_at = "ended", now()
    vs.duration_sec = int((vs.ended_at - vs.started_at).total_seconds())
    segs = (await db.execute(select(VoiceSegment).where(VoiceSegment.voice_session_id == vs.id).order_by(VoiceSegment.created_at))).scalars().all()
    lat = [s.latency_ms for s in segs if s.latency_ms]
    vs.avg_latency_ms = sum(lat) / len(lat) if lat else None
    transcript = "\n".join(f"{s.speaker}: {s.text}" for s in segs)
    if transcript:
        summary = await llm.chat_text("Summarize this customer support call in 2 sentences: issue, outcome.", [{"role": "user", "content": transcript[:6000]}], temperature=0.2, max_tokens=120)
        vs.summary = summary or f"Call with {len(segs)} turns."
        conv = await db.get(Conversation, vs.conversation_id)
        conv.summary = vs.summary
    await emit(db, p.org_id, vs.conversation_id, "voice.ended", {"voice_session_id": str(vs.id), "duration_sec": vs.duration_sec})
    await db.commit()
    return row(vs)


@router.get("/sessions")
async def list_sessions(p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(VoiceSession).where(VoiceSession.org_id == p.org_id).order_by(VoiceSession.started_at.desc()).limit(100))).scalars()
    return [row(v) for v in rows]


@router.get("/sessions/{sid}/transcript")
async def transcript(sid: uuid.UUID, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    vs = await db.get(VoiceSession, sid)
    if not vs or vs.org_id != p.org_id:
        raise HTTPException(404)
    segs = (await db.execute(select(VoiceSegment).where(VoiceSegment.voice_session_id == sid).order_by(VoiceSegment.created_at))).scalars()
    return {"session": row(vs), "segments": [row(s) for s in segs]}


# ----- internal endpoints used by the LiveKit agent worker -------------------------------------------------
def worker_auth(x_worker_secret: str = Header(...)):
    if x_worker_secret != settings.voice_worker_secret:
        raise HTTPException(401, "Bad worker secret")


@router.get("/internal/room/{room_name}", dependencies=[Depends(worker_auth)])
async def room_lookup(room_name: str, db: AsyncSession = Depends(get_db)):
    vs = (await db.execute(select(VoiceSession).where(VoiceSession.room_name == room_name))).scalar_one_or_none()
    if not vs:
        raise HTTPException(404)
    return {"voice_session_id": str(vs.id), "conversation_id": str(vs.conversation_id), "language": vs.language}


class TurnIn(BaseModel):
    voice_session_id: uuid.UUID
    text: str
    language: str | None = None
    confidence: float | None = None
    stt_ms: int | None = None


@router.post("/internal/turn", dependencies=[Depends(worker_auth)])
async def turn(body: TurnIn, db: AsyncSession = Depends(get_db)):
    """STT text in -> same conversation engine as chat -> reply text out (for TTS)."""
    vs = await db.get(VoiceSession, body.voice_session_id)
    if not vs or vs.status != "active":
        raise HTTPException(404, "Voice session not active")
    conv = await db.get(Conversation, vs.conversation_id)
    t_start = (now() - vs.started_at).total_seconds()
    db.add(VoiceSegment(org_id=vs.org_id, voice_session_id=vs.id, speaker="customer", text=body.text,
                        language=body.language, confidence=body.confidence, offset_ms=int(t_start * 1000)))
    await emit(db, vs.org_id, conv.id, "voice.transcript.updated", {"speaker": "customer", "text": body.text})
    result = await service.handle_customer_message(db, conv, body.text, "voice", meta={"stt_confidence": body.confidence})
    reply = result.get("reply")
    if reply:
        latency = (result.get("latency_ms") or 0) + (body.stt_ms or 0)
        db.add(VoiceSegment(org_id=vs.org_id, voice_session_id=vs.id, speaker="ai", text=reply["content"],
                            language=result.get("language"), latency_ms=latency, offset_ms=int((now() - vs.started_at).total_seconds() * 1000)))
        await emit(db, vs.org_id, conv.id, "voice.transcript.updated", {"speaker": "ai", "text": reply["content"], "latency_ms": latency})
    await db.commit()
    return {"reply": reply["content"] if reply else None, "handled_by": result["handled_by"], "language": result.get("language"),
            "escalated": result.get("escalated", False)}
