import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.config import settings

_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(max_calls: int = 30, per_seconds: int = 60):
    """In-memory sliding window per client IP. Swap for Redis when running >1 worker."""

    async def dep(request: Request):
        if not settings.rate_limit_enabled:
            return
        key = f"{request.url.path}:{request.client.host if request.client else 'x'}"
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > per_seconds:
            q.popleft()
        if len(q) >= max_calls:
            raise HTTPException(429, "Too many requests")
        q.append(now)

    return dep
