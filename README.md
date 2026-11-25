# Voxera: AI Customer Support & Voice Agent

```
Voxera/
  backend/    FastAPI + LangGraph + pgvector + Groq + LiveKit voice worker
  frontend/   React + TypeScript + Vite + Tailwind, "Obsidian Ember" design
  docs/       architecture.md, evaluation.md, DEPLOY.md, VOICE_SETUP.md
  docker-compose.yml   optional: Postgres (pgvector, port 5433) + Redis
  .github/workflows/ci.yml
```

## Run locally (Windows PowerShell)
You need PostgreSQL **with pgvector**: either `docker compose up -d` (from this folder), or a free Neon database (see `docs/DEPLOY.md`).

```powershell
# backend (terminal 1)
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env         # set DATABASE_URL, JWT_SECRET (32+ chars), optionally GROQ_API_KEY
.\.venv\Scripts\python.exe -m scripts.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# frontend (terminal 2)
cd frontend
npm install
npm run dev                    # http://localhost:5173
```
Login `admin@voxera.dev` / `Voxera@123`. Customer chat: `http://localhost:5173/chat/demo` (email `ananya@example.com`, verify with `4821`).
Use `.\.venv\Scripts\python.exe -m ...` (not bare `pip`/`pytest`) so packages land in the venv.

## Voice, deployment, tests
- Voice (Deepgram, LiveKit, ElevenLabs keys): `docs/VOICE_SETUP.md`
- Deploy (Neon + Render + Vercel): `docs/DEPLOY.md`
- Tests and evaluation: below and `docs/evaluation.md`

## Testing and evaluation
| What | Command | Notes |
|---|---|---|
| Backend unit tests | `cd backend; .\.venv\Scripts\python.exe -m pytest` | no DB needed |
| 105 conversation evals | `cd backend; .\.venv\Scripts\python.exe -m evals.run_evals` | seeded DB + API running with `RATE_LIMIT_ENABLED=false` |
| Voice WER / latency | `python -m evals.voice_metrics --samples evals/voice_samples.jsonl` | fill the `hyp` fields from your STT |
| Frontend unit tests | `cd frontend; npm test` | |
| Browser e2e (Playwright) | `cd frontend; npx playwright install chromium; npm run test:e2e` | API running and seeded |
