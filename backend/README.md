# Voxera backend

FastAPI + SQLAlchemy 2 (async) + PostgreSQL/pgvector + LangGraph + Groq + LiveKit.

## Run (Windows PowerShell)

```powershell
cd backend
python -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # add GROQ_API_KEY (free at console.groq.com) and a JWT_SECRET
docker compose up -d            # Postgres+pgvector on :5433 and Redis on :6379
python -m scripts.seed          # demo org, customers, orders, policies, 60 historical conversations
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs · Staff login: `admin@voxera.dev` / `Voxera@123`
(also `manager@`, `agent@`, `analyst@`). Public chat org slug: `demo`. Test customer: `ananya@example.com`, phone ends `4821`.

Without `GROQ_API_KEY` the agent still works end to end using heuristic intent + templated replies (good for testing);
with a key, Groq classifies intent and phrases replies from backend-verified facts.

## Voice (needs LiveKit Cloud + Deepgram + ElevenLabs keys)

```powershell
python -m venv .venv-voice ; .\.venv-voice\Scripts\Activate.ps1
pip install -r requirements-voice.txt
python voice_worker.py dev
```

## Tests
`pytest` (unit tests, no DB needed).

## Notes
- Tables are created on startup (`create_all`) for speed; run `alembic init alembic` and autogenerate before production.
- Event hub is in-process; use Redis Pub/Sub before running more than one worker.
- LangGraph checkpointer is `MemorySaver`; conversation history in Postgres is the source of truth.

## Evaluation
`python -m evals.dataset` (regenerate 105 cases), `python -m evals.run_evals` (run them; start the API with `RATE_LIMIT_ENABLED=false`),
`python -m evals.voice_metrics`. Details in `../docs/evaluation.md`.
