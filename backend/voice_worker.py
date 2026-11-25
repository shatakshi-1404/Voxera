"""LiveKit voice agent worker (run in its own process / venv: pip install -r requirements-voice.txt).

   python voice_worker.py dev

Pipeline: LiveKit audio -> Deepgram STT (multilingual, handles Hindi/English code-switching) -> POST /voice/internal/turn
(the same LangGraph engine as chat) -> ElevenLabs TTS -> LiveKit. Barge-in is handled by the AgentSession
(VAD interrupts TTS when the customer starts speaking). Written against livekit-agents 1.x; plugin/class names move
between releases, so check the LiveKit Agents docs if an import fails.
"""
import logging
import os

import httpx
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import deepgram, elevenlabs, silero

load_dotenv()
BACKEND = os.getenv("BACKEND_URL", "http://localhost:8000")
HEADERS = {"X-Worker-Secret": os.getenv("VOICE_WORKER_SECRET", "dev-worker-secret")}
log = logging.getLogger("voxera.voice")


class VoxeraAgent(Agent):
    def __init__(self, voice_session_id: str):
        super().__init__(instructions="Voxera customer support voice agent. Replies come from the Voxera backend.")
        self.vsid = voice_session_id
        self.http = httpx.AsyncClient(timeout=30)

    async def llm_node(self, chat_ctx, tools, model_settings):
        """Replace the LLM step: send the customer's transcript to the backend engine, stream back the reply text."""
        last = next((m for m in reversed(chat_ctx.items) if getattr(m, "role", None) == "user"), None)
        text = (last.text_content if last else "") or ""
        if not text.strip():
            return
        try:
            r = await self.http.post(f"{BACKEND}/api/v1/voice/internal/turn", headers=HEADERS,
                                     json={"voice_session_id": self.vsid, "text": text})
            r.raise_for_status()
            reply = r.json().get("reply")
        except Exception as e:
            log.exception("turn failed: %s", e)
            reply = "Sorry, I'm having trouble. Let me get a human agent for you."
        if reply:  # None => a human agent owns the conversation, stay silent
            yield reply


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    async with httpx.AsyncClient() as h:
        info = (await h.get(f"{BACKEND}/api/v1/voice/internal/room/{ctx.room.name}", headers=HEADERS)).json()
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="multi"),
        tts=elevenlabs.TTS(model="eleven_multilingual_v2"),
        vad=silero.VAD.load(),
        allow_interruptions=True,
    )
    await session.start(room=ctx.room, agent=VoxeraAgent(info["voice_session_id"]))
    await session.say("Hello, you've reached Voxera support. How can I help you today?", allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
