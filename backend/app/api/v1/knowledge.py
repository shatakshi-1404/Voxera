import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal, get_db
from app.deps import ADMINS, ALL_STAFF, MANAGERS, Principal, require
from app.models import Document, DocumentChunk
from app.rag import service as rag
from app.utils import row

router = APIRouter(tags=["knowledge"])
MAX_BYTES = 10 * 1024 * 1024


async def _ingest_bg(doc_id: uuid.UUID):
    async with SessionLocal() as db:
        doc = await db.get(Document, doc_id)
        await rag.ingest(db, doc)


@router.get("/documents")
async def list_docs(p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    docs = (await db.execute(select(Document).where(Document.org_id == p.org_id).order_by(Document.created_at.desc()))).scalars()
    return [row(d) for d in docs]


@router.post("/documents")
async def upload(bg: BackgroundTasks, file: UploadFile = File(...), title: str | None = Form(None), category: str = Form("general"),
                 collection: str = Form("default"), p: Principal = Depends(require(*MANAGERS)), db: AsyncSession = Depends(get_db)):
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (10 MB max)")
    try:
        text = rag.extract_text(file.filename or "doc.txt", data)
    except Exception as e:
        raise HTTPException(422, f"Could not read file: {e}")
    doc = Document(org_id=p.org_id, title=title or file.filename or "Untitled", category=category, collection=collection,
                   filename=file.filename, raw_text=text)
    db.add(doc)
    await db.commit()
    bg.add_task(_ingest_bg, doc.id)
    return row(doc)


async def _get(db, p, doc_id) -> Document:
    d = await db.get(Document, doc_id)
    if not d or d.org_id != p.org_id:
        raise HTTPException(404, "Document not found")
    return d


@router.get("/documents/{doc_id}/chunks")
async def chunks(doc_id: uuid.UUID, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    d = await _get(db, p, doc_id)
    cs = (await db.execute(select(DocumentChunk).where(DocumentChunk.document_id == d.id).order_by(DocumentChunk.chunk_index))).scalars()
    return [row(c) for c in cs]


@router.post("/documents/{doc_id}/reindex")
async def reindex(doc_id: uuid.UUID, bg: BackgroundTasks, p: Principal = Depends(require(*MANAGERS)), db: AsyncSession = Depends(get_db)):
    d = await _get(db, p, doc_id)
    d.status, d.version = "processing", d.version + 1  # knowledge versioning
    await db.commit()
    bg.add_task(_ingest_bg, d.id)
    return row(d)


@router.delete("/documents/{doc_id}")
async def delete(doc_id: uuid.UUID, p: Principal = Depends(require(*ADMINS)), db: AsyncSession = Depends(get_db)):
    d = await _get(db, p, doc_id)
    await db.delete(d)
    await db.commit()
    return {"deleted": True}


class SearchIn(BaseModel):
    query: str
    k: int = 4
    collection: str | None = None


@router.post("/knowledge/search")
async def search(body: SearchIn, p: Principal = Depends(require(*ALL_STAFF)), db: AsyncSession = Depends(get_db)):
    from app.core.config import settings
    hits = await rag.search(db, p.org_id, body.query, min(body.k, 10), body.collection)
    return {"query": body.query, "min_score": settings.rag_min_score,
            "hits": hits, "sufficient_evidence": any(h["score"] >= settings.rag_min_score for h in hits)}
