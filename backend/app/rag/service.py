import asyncio
import hashlib
import io
import math
import re
import uuid

from sqlalchemy import delete, select

from app.core.config import settings
from app.models import Document, DocumentChunk

_model = None
_STOP = {"the", "a", "an", "is", "are", "to", "of", "and", "or", "in", "on", "for", "my", "i", "can", "do", "how",
         "what", "it", "me", "be", "you", "your", "this", "that", "with", "at", "by"}


def _get_model():
    global _model
    if _model is None:
        try:
            from fastembed import TextEmbedding

            # multilingual (Hindi/English), 384-dim
            _model = TextEmbedding("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
        except Exception:
            _model = False
    return _model


def _hash_embed(text: str, dim: int) -> list[float]:
    v = [0.0] * dim
    for tok in re.findall(r"\w+", text.lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        v[h % dim] += 1.0 if (h >> 8) & 1 else -1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _embed_sync(texts: list[str]) -> list[list[float]]:
    m = _get_model()
    if m:
        return [[float(x) for x in e] for e in m.embed(texts)]
    return [_hash_embed(t, settings.embedding_dim) for t in texts]  # offline fallback, lexical-ish only


async def embed(texts: list[str]) -> list[list[float]]:
    return await asyncio.to_thread(_embed_sync, texts)


def chunk_text(text: str, size: int = 800, overlap: int = 120) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        if len(cur) + len(p) + 2 <= size:
            cur = f"{cur}\n\n{p}" if cur else p
        else:
            if cur:
                chunks.append(cur)
            while len(p) > size:  # hard-split giant paragraphs
                chunks.append(p[:size])
                p = p[size - overlap:]
            cur = p
    if cur:
        chunks.append(cur)
    return chunks


def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        return "\n\n".join((pg.extract_text() or "") for pg in PdfReader(io.BytesIO(data)).pages)
    if name.endswith(".docx"):
        from docx import Document as Docx

        return "\n\n".join(p.text for p in Docx(io.BytesIO(data)).paragraphs)
    return data.decode("utf-8", errors="ignore")


async def ingest(db, doc: Document, text: str | None = None):
    """(Re)build chunks + embeddings for a document."""
    try:
        if text is not None:
            doc.raw_text = text
        text = doc.raw_text or ""
        if not text.strip():
            raise ValueError("Document has no extractable text")
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
        chunks = chunk_text(text)
        vecs = await embed(chunks)
        for i, (c, v) in enumerate(zip(chunks, vecs)):
            db.add(DocumentChunk(org_id=doc.org_id, document_id=doc.id, chunk_index=i, content=c, embedding=v))
        doc.chunk_count, doc.status, doc.error = len(chunks), "ready", None
    except Exception as e:
        doc.status, doc.error = "failed", str(e)[:480]
    await db.commit()


def _stem(t: str) -> str:
    for suf in ("ing", "ed", "es", "s"):
        if t.endswith(suf) and len(t) - len(suf) >= 3:
            return t[: -len(suf)]
    return t


def _tokens(s: str) -> set[str]:
    return {_stem(t) for t in re.findall(r"\w+", s.lower()) if t not in _STOP and len(t) > 1}


async def search(db, org_id: uuid.UUID, query: str, k: int = 4, collection: str | None = None) -> list[dict]:
    """Hybrid retrieval: pgvector cosine (tenant-filtered) + lexical overlap rerank."""
    qv = (await embed([query]))[0]
    dist = DocumentChunk.embedding.cosine_distance(qv).label("dist")
    stmt = (select(DocumentChunk, Document.title, Document.version, dist)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.org_id == org_id, Document.status == "ready"))
    if collection:
        stmt = stmt.where(Document.collection == collection)
    rows = (await db.execute(stmt.order_by(dist).limit(k * 4))).all()
    qt = _tokens(query)
    out = []
    for ch, title, version, d in rows:
        sem = max(0.0, 1.0 - float(d))
        lex = len(qt & _tokens(ch.content)) / (len(qt) or 1)
        out.append({"chunk_id": str(ch.id), "document_id": str(ch.document_id), "title": title, "version": version,
                    "content": ch.content, "semantic": round(sem, 3), "lexical": round(lex, 3),
                    "score": round(0.7 * sem + 0.3 * lex, 3)})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:k]
