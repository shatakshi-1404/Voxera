"""Voice evaluation: Word Error Rate per language + call latency / completion stats from the database.

  python -m evals.voice_metrics --samples evals/voice_samples.jsonl      # WER (fill in the "hyp" fields first)
  python -m evals.voice_metrics --db                                      # latency + completion from real calls

How to build the WER set: record each "ref" sentence (quiet room, noisy cafe, speakerphone), run the audio through your STT
(Deepgram nova-3 multi), paste the transcript into "hyp". Rows with hyp == null are skipped.
Server-side metrics cannot measure barge-in success or true time-to-first-audio (that needs client-side timestamps);
latency_ms here is STT + engine time recorded per AI turn.
"""
import argparse
import asyncio
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path


def _words(s: str) -> list[str]:
    return re.findall(r"\w+", s.lower())


def wer(ref: str, hyp: str) -> float:
    r, h = _words(ref), _words(hyp)
    if not r:
        return 0.0 if not h else 1.0
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / len(r)


def wer_report(path: Path) -> dict:
    by = defaultdict(list)
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("hyp"):
            by[f"{row['lang']}/{row.get('condition', 'clean')}"].append(wer(row["ref"], row["hyp"]))
    return {k: {"n": len(v), "wer": round(statistics.mean(v), 3)} for k, v in by.items()}


async def db_report() -> dict:
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import VoiceSegment, VoiceSession

    async with SessionLocal() as db:
        sessions = (await db.execute(select(VoiceSession))).scalars().all()
        lat = sorted(s.latency_ms for s in (await db.execute(select(VoiceSegment).where(VoiceSegment.speaker == "ai"))).scalars() if s.latency_ms)
    done = [s for s in sessions if s.status == "ended" and (s.duration_sec or 0) > 3]
    pick = lambda p: lat[min(len(lat) - 1, int(len(lat) * p))] if lat else None
    return {"calls": len(sessions), "completion_rate": round(len(done) / len(sessions), 3) if sessions else None,
            "ai_turns": len(lat), "latency_ms_p50": pick(0.5), "latency_ms_p95": pick(0.95)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=Path)
    ap.add_argument("--db", action="store_true")
    a = ap.parse_args()
    if a.samples:
        print(json.dumps(wer_report(a.samples), indent=1))
    if a.db:
        print(json.dumps(asyncio.run(db_report()), indent=1))
