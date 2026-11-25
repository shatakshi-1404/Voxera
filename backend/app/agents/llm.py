import json
import logging

from app.core.config import settings

log = logging.getLogger("voxera.llm")
_client = None


def _get_client():
    global _client
    if _client is None and settings.groq_api_key:
        from groq import AsyncGroq

        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


async def chat_json(system: str, user: str, model: str | None = None, temperature: float = 0.0) -> dict | None:
    c = _get_client()
    if not c:
        return None
    try:
        r = await c.chat.completions.create(
            model=model or settings.groq_model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=400,
        )
        return json.loads(r.choices[0].message.content)
    except Exception as e:  # network, rate limit, bad JSON -> caller falls back to heuristics
        log.warning("chat_json failed: %s", e)
        return None


async def chat_text(system: str, messages: list[dict], model: str | None = None, temperature: float = 0.3,
                    max_tokens: int = 350) -> str | None:
    c = _get_client()
    if not c:
        return None
    try:
        r = await c.chat.completions.create(
            model=model or settings.groq_model,
            temperature=temperature,
            messages=[{"role": "system", "content": system}, *messages],
            max_tokens=max_tokens,
        )
        return (r.choices[0].message.content or "").strip() or None
    except Exception as e:
        log.warning("chat_text failed: %s", e)
        return None
