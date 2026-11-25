# Voice setup (LiveKit + Deepgram + ElevenLabs)

Voice needs three external accounts. Each key is shown only once when created: copy it immediately, never commit it to git, and revoke/regenerate it if it leaks.

## 1. Deepgram (speech-to-text)
1. Sign up at https://console.deepgram.com/signup. Deepgram's docs say signup is free and includes starter credit (their guides cite $200; credit expires after a year). Check the Console for your actual balance.
2. In the Console choose your project, open **API Keys** under *Manage*, click **Create a new API key**.
3. Name it (for example `voxera-dev`); the **Member** role is enough. Click Create and copy the secret.
4. Put it in `backend/.env`: `DEEPGRAM_API_KEY=...`

## 2. LiveKit Cloud (real-time audio)
1. Create a project at https://cloud.livekit.io (free tier available).
2. Project **Settings -> Keys** -> create a key. Copy the WebSocket URL (`wss://<project>.livekit.cloud`), API key and API secret.
3. `backend/.env`: `LIVEKIT_URL=wss://...`, `LIVEKIT_API_KEY=...`, `LIVEKIT_API_SECRET=...`

## 3. ElevenLabs (text-to-speech, needed for Hindi)
Create an account at https://elevenlabs.io, open your profile -> **API Keys**, create one, then `ELEVEN_API_KEY=...` in `backend/.env`.
(Deepgram also sells text-to-speech, but this project's worker uses ElevenLabs because of its multilingual voices; Deepgram TTS is not wired in.)

## 4. Run
```powershell
# terminal 1: API (from backend/)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
# terminal 2: voice worker, in its own virtual environment
cd backend
python -m venv .venv-voice
.\.venv-voice\Scripts\python.exe -m pip install -r requirements-voice.txt
.\.venv-voice\Scripts\python.exe voice_worker.py dev
# terminal 3: frontend -> http://localhost:5173 -> Voice Studio -> Start call
```
Allow microphone access when the browser asks. Check Integrations in the app: LiveKit should show Connected.

## Troubleshooting
- "LiveKit is not configured": the API process did not load the `LIVEKIT_*` values; restart it after editing `.env`.
- Call connects but nobody answers: the worker is not running, or `BACKEND_URL` / `VOICE_WORKER_SECRET` differ between worker and API.
- `ImportError` in the worker: `livekit-agents` changes between releases; match your installed version against the LiveKit Agents docs.
- No microphone: browser blocked permission; allow it in the address bar and retry.
- Run `python -m evals.voice_metrics` after 10+ real calls before quoting any voice number on a resume.
