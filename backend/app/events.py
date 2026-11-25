"""Real-time event hub.

In-process asyncio pub/sub fanning out to WebSocket clients. Every event is also persisted to
conversation_events. For >1 uvicorn worker, replace `Hub.publish` with Redis Pub/Sub (same interface).
"""
import asyncio
import datetime as dt
from collections import defaultdict

from app.models import ConversationEvent


class Hub:
    def __init__(self):
        self.subs: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, channel: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self.subs[channel].add(q)
        return q

    def unsubscribe(self, channel: str, q: asyncio.Queue):
        self.subs[channel].discard(q)

    async def publish(self, channel: str, event: dict):
        for q in list(self.subs.get(channel, ())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass


hub = Hub()


async def emit(db, org_id, conversation_id, type_: str, payload: dict | None = None, persist: bool = True):
    payload = payload or {}
    event = {
        "type": type_,
        "conversation_id": str(conversation_id) if conversation_id else None,
        "payload": payload,
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    if persist and type_ != "agent.typing":
        db.add(ConversationEvent(org_id=org_id, conversation_id=conversation_id, type=type_, payload=payload))
    await hub.publish(f"org:{org_id}", event)
    if conversation_id:
        await hub.publish(f"conv:{conversation_id}", event)
