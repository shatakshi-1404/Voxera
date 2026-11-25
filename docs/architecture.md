# Voxera architecture

- **One engine, two channels:** chat and voice both call `backend/app/conversations/service.py::handle_customer_message`.
- **Agent:** LangGraph `intent -> verify | order | refund | knowledge | action | close | escalate -> respond`. The graph, not the LLM, decides which tools run. The LLM only classifies intent and phrases replies from backend-verified facts.
- **Safety:** identity needs email + last 4 of the registered phone (3 attempts, then escalation). Refunds are re-validated in the backend (30-day window, INR 5000 auto limit, idempotent) and are requests only. Human takeover silences the AI until released.
- **Realtime:** in-process hub -> WebSockets (`/api/v1/stream` for staff, `/public/conversations/{id}/stream` for customers). Events are persisted in `conversation_events`.
- **Voice:** browser <-> LiveKit <-> `backend/voice_worker.py` (Deepgram STT, ElevenLabs TTS) -> `POST /voice/internal/turn` -> same engine. LiveKit tokens are minted server-side.
- **RAG:** chunk -> multilingual MiniLM embeddings -> pgvector -> hybrid rerank -> cited answer. Below the score threshold the AI says it doesn't know and offers a human.
