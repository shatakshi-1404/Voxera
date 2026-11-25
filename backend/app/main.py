import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1 import ai, analytics, auth, conversations, customers, knowledge, public, tickets, voice
from app.core.config import settings
from app.core.db import Base, engine
from app.core.logging import setup_logging
import app.models  # noqa: F401  (register tables)

setup_logging()
log = logging.getLogger("voxera")


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)  # dev convenience; use Alembic migrations in production
    yield
    await engine.dispose()


app = FastAPI(title="Voxera API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_origin_regex=settings.cors_origin_regex or None, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

API = "/api/v1"
app.include_router(auth.router, prefix=API)
app.include_router(auth.team_router, prefix=API)
app.include_router(customers.router, prefix=API)
app.include_router(conversations.router, prefix=API)
app.include_router(public.router, prefix=API)
app.include_router(tickets.router, prefix=API)
app.include_router(tickets.refunds, prefix=API)
app.include_router(knowledge.router, prefix=API)
app.include_router(voice.router, prefix=API)
app.include_router(analytics.router, prefix=API)
app.include_router(ai.router, prefix=API)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


@app.get("/health")
async def health():
    try:
        async with engine.connect() as c:
            await c.execute(text("SELECT 1"))
        db = "ok"
    except Exception:
        db = "down"
    return {"status": "ok" if db == "ok" else "degraded", "db": db, "llm": bool(settings.groq_api_key),
            "livekit": bool(settings.livekit_url)}
