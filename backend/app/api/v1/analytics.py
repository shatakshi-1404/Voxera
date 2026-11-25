import datetime as dt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.deps import ALL_STAFF, Principal, require
from app.models import Conversation, Escalation, Feedback, Ticket, VoiceSession, now

router = APIRouter(tags=["analytics"])


async def compute_overview(db, org_id, days: int = 30) -> dict:
    since = now() - dt.timedelta(days=days)
    C = Conversation
    base = [C.org_id == org_id, C.is_test.is_(False), C.created_at >= since]
    total = (await db.execute(select(func.count()).select_from(C).where(*base))).scalar_one()
    by_status = dict((await db.execute(select(C.status, func.count()).where(*base).group_by(C.status))).all())
    resolved_ai = (await db.execute(select(func.count()).select_from(C).where(*base, C.resolved_by == "ai"))).scalar_one()
    resolved_all = (await db.execute(select(func.count()).select_from(C).where(*base, C.status == "resolved"))).scalar_one()
    escalated = (await db.execute(select(func.count(func.distinct(Escalation.conversation_id))).join(C, C.id == Escalation.conversation_id).where(*base))).scalar_one()
    today = now().replace(hour=0, minute=0, second=0, microsecond=0)
    ai_today = (await db.execute(select(func.count()).select_from(C).where(C.org_id == org_id, C.resolved_by == "ai", C.resolved_at >= today))).scalar_one()
    avg_first = (await db.execute(select(func.avg(func.extract("epoch", C.first_response_at - C.created_at))).where(*base, C.first_response_at.isnot(None)))).scalar()
    avg_res = (await db.execute(select(func.avg(func.extract("epoch", C.resolved_at - C.created_at))).where(*base, C.resolved_at.isnot(None)))).scalar()
    csat = (await db.execute(select(func.avg(Feedback.rating), func.count()).where(Feedback.org_id == org_id, Feedback.created_at >= since))).one()
    day = func.date_trunc("day", C.created_at)
    series = (await db.execute(select(day, func.count(), func.sum(case((C.resolved_by == "ai", 1), else_=0))).where(*base).group_by(day).order_by(day))).all()
    csat_day = func.date_trunc("day", Feedback.created_at)
    csat_series = (await db.execute(select(csat_day, func.avg(Feedback.rating)).where(Feedback.org_id == org_id, Feedback.created_at >= since).group_by(csat_day).order_by(csat_day))).all()
    by_channel = dict((await db.execute(select(C.channel, func.count()).where(*base).group_by(C.channel))).all())
    by_lang = dict((await db.execute(select(C.language, func.count()).where(*base).group_by(C.language))).all())
    intents = (await db.execute(select(C.last_intent, func.count()).where(*base, C.last_intent.isnot(None)).group_by(C.last_intent).order_by(func.count().desc()).limit(8))).all()
    voice_lat = (await db.execute(select(func.avg(VoiceSession.avg_latency_ms), func.count()).where(VoiceSession.org_id == org_id, VoiceSession.started_at >= since))).one()
    open_tickets = (await db.execute(select(func.count()).select_from(Ticket).where(Ticket.org_id == org_id, Ticket.status.in_(["open", "in_progress", "waiting"])))).scalar_one()
    breached = (await db.execute(select(func.count()).select_from(Ticket).where(Ticket.org_id == org_id, Ticket.status.in_(["open", "in_progress", "waiting"]), Ticket.sla_due_at < now()))).scalar_one()
    terminal = resolved_all + max(0, escalated - 0)
    return {
        "window_days": days, "total_conversations": total, "by_status": by_status,
        "open_conversations": by_status.get("open", 0) + by_status.get("waiting", 0) + by_status.get("escalated", 0),
        "ai_resolved_today": ai_today, "ai_resolved": resolved_ai, "resolved": resolved_all, "escalated": escalated,
        # containment counts only conversations the AI genuinely resolved (customer confirmed), never mere silence
        "ai_containment_rate": round(resolved_ai / terminal, 3) if terminal else None,
        "escalation_rate": round(escalated / total, 3) if total else None,
        "avg_first_response_sec": float(avg_first) if avg_first is not None else None,
        "avg_resolution_sec": float(avg_res) if avg_res is not None else None,
        "csat_avg": round(float(csat[0]), 2) if csat[0] is not None else None, "csat_count": csat[1],
        "conversations_over_time": [{"date": d.date().isoformat(), "total": n, "ai_resolved": int(a or 0)} for d, n, a in series],
        "csat_trend": [{"date": d.date().isoformat(), "csat": round(float(v), 2)} for d, v in csat_series],
        "by_channel": by_channel, "by_language": by_lang,
        "top_intents": [{"intent": i, "count": n} for i, n in intents],
        "voice": {"sessions": voice_lat[1], "avg_latency_ms": float(voice_lat[0]) if voice_lat[0] is not None else None},
        "open_tickets": open_tickets, "sla_breached": breached,
    }


@router.get("/analytics/overview")
async def overview(days: int = Query(30, ge=1, le=180), p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    return await compute_overview(db, p.org_id, days)


@router.get("/dashboard")
async def dashboard(p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    from app.api.v1.conversations import conv_card
    o = await compute_overview(db, p.org_id, 7)
    recent = (await db.execute(select(Conversation).where(Conversation.org_id == p.org_id, Conversation.is_test.is_(False))
                               .order_by(Conversation.last_message_at.desc()).limit(8))).scalars().all()
    return {"summary": {k: o[k] for k in ("open_conversations", "ai_resolved_today", "escalated", "ai_containment_rate", "csat_avg", "open_tickets", "sla_breached")},
            "recent_conversations": [await conv_card(db, c) for c in recent]}
