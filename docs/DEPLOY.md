# Deploying Voxera (Neon + Render + Vercel)

Vercel hosts only the React frontend. The FastAPI backend needs long-running WebSockets, so it runs on Render (or Railway/Fly). The database is Neon.

## 1. Database (Neon)
1. Create a project and a database called `voxera`. pgvector is supported (the app runs `CREATE EXTENSION vector` itself).
2. Copy the **direct** connection string (hostname WITHOUT `-pooler`) and rewrite it for asyncpg:
   `postgresql+asyncpg://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/voxera?ssl=require`
3. Seed it once from your laptop (any machine with the backend venv):
   ```powershell
   cd backend
   $env:DATABASE_URL="postgresql+asyncpg://...neon...?ssl=require"
   .\.venv\Scripts\python.exe -m scripts.seed
   ```

## 2. Backend (Render web service)
- Root directory: `backend` · Build: `pip install -r requirements.txt` · Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment variables:
  | Name | Value |
  |---|---|
  | `DATABASE_URL` | the Neon string above |
  | `JWT_SECRET` | random, 32+ characters |
  | `GROQ_API_KEY` | your Groq key (optional; without it the agent uses heuristic replies) |
  | `CORS_ORIGINS` | `["https://your-app.vercel.app"]` (JSON list) |
  | `PYTHON_VERSION` | `3.12.8` (some packages lack Python 3.13 wheels) |
- CORS already allows any `https://voxera-*.vercel.app` URL (setting `CORS_ORIGIN_REGEX`). Change it if your Vercel project has a different name.
- Free instances sleep after idle (first request ~1 minute) and have ~512 MB RAM. The multilingual embedding model loads on the first knowledge-base query and may exceed that; use a bigger instance or accept the weaker fallback embeddings.
- Check: open `https://YOUR-BACKEND.onrender.com/health`. It must show `"db":"ok"`.

## 3. Frontend (Vercel)
- Root directory: `frontend` · Framework: Vite
- Environment variable: `VITE_API_URL=https://YOUR-BACKEND.onrender.com` (no trailing slash, no `/api/v1`). It is read at BUILD time, so redeploy after changing it.
- `frontend/vercel.json` makes deep links such as `/inbox` and `/chat/demo` work on refresh.

## 4. Verify
```powershell
curl.exe -i -X OPTIONS https://YOUR-BACKEND.onrender.com/api/v1/auth/login -H "Origin: https://your-app.vercel.app" -H "Access-Control-Request-Method: POST"
```
The response must contain `access-control-allow-origin`.

## The voice worker is NOT deployed here
`backend/voice_worker.py` is a long-running process. Run it on your own machine for demos, or on a paid background-worker instance. See `docs/VOICE_SETUP.md`.
