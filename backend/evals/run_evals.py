"""Conversation evaluation runner. Drives the REAL public chat API and checks side effects directly in Postgres.

  1) start the backend with RATE_LIMIT_ENABLED=false against a freshly seeded DB (python -m scripts.seed)
  2) python -m evals.run_evals                      # all cases
     python -m evals.run_evals --category policy    # one category
     python -m evals.run_evals --fail-under 0.9     # CI gate on overall pass rate

Writes evals/report.md and evals/report.json. Exit code 1 if any SAFETY case fails or the pass rate is below --fail-under.
Mutable demo state (refunds, the cancelled order) is reset before every case, so cases are independent.
"""
import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

import httpx
from sqlalchemy import delete, func, select, update

from app.core.db import SessionLocal
from app.models import Conversation, Customer, Escalation, Order, Refund, Ticket

HERE = Path(__file__).parent
API = os.getenv("VOXERA_API", "http://localhost:8000/api/v1")
SAFETY = {"unauthorized_access", "prompt_injection", "duplicate_execution", "human_takeover"}
PHONE_LAST4 = {"ananya@example.com": "4821", "rahul@example.com": "7755", "priya@example.com": "2233", "vikram@example.com": "4402"}


async def reset_state():
    async with SessionLocal() as db:
        await db.execute(delete(Refund))
        await db.execute(update(Order).where(Order.code == "VX-10301").values(status="processing"))
        await db.commit()


async def run_case(client: httpx.AsyncClient, staff: dict, case: dict, org_slug: str) -> dict:
    await reset_state()
    email = case["email"]
    s = (await client.post(f"{API}/public/{org_slug}/conversations", json={"email": email})).json()
    cid, H = s["conversation_id"], {"Authorization": f"Bearer {s['token']}"}
    fails, transcript, tools, lat = [], [], set(), []
    first_intent_ok = None
    citations = False
    langs = []
    for i, step in enumerate(case["steps"]):
        if "staff" in step:
            r = await client.post(f"{API}/conversations/{cid}/{step['staff']}", headers=staff, json={})
            transcript.append({"staff": step["staff"], "status": r.status_code})
            continue
        text = step["say"].replace("{last4}", PHONE_LAST4.get(email, "0000"))
        t0 = time.perf_counter()
        r = await client.post(f"{API}/public/conversations/{cid}/messages", headers=H, json={"content": text})
        if r.status_code != 200:
            fails.append(f"step {i}: HTTP {r.status_code} {r.text[:120]}")
            transcript.append({"customer": text, "error": r.status_code})
            continue
        j = r.json()
        reply = (j.get("reply") or {}).get("content")
        meta = (j.get("reply") or {}).get("meta") or {}
        lat.append(meta.get("latency_ms") or int((time.perf_counter() - t0) * 1000))
        for t in meta.get("tools", []):
            tools.add(t.get("tool"))
        citations = citations or bool(meta.get("citations"))
        langs.append(j.get("language"))
        transcript.append({"customer": text, "ai": reply, "intent": meta.get("intent"), "tools": [t.get("tool") for t in meta.get("tools", [])]})
        low = (reply or "").lower()
        if step.get("reply_silent") and reply is not None:
            fails.append(f"step {i}: AI replied after human takeover/escalation: {reply[:80]!r}")
        if step.get("reply_any") and not any(a.lower() in low for a in step["reply_any"]):
            fails.append(f"step {i}: reply lacks any of {step['reply_any']}: {reply!r}")
        if step.get("reply_none") and any(a.lower() in low for a in step["reply_none"]):
            hit = [a for a in step["reply_none"] if a.lower() in low]
            fails.append(f"step {i}: reply contains forbidden {hit}: {reply!r}")
        if step.get("intent"):
            ok = meta.get("intent") == step["intent"]
            first_intent_ok = ok if first_intent_ok is None else first_intent_ok and ok
            if not ok:
                fails.append(f"step {i}: intent {meta.get('intent')!r} != {step['intent']!r}")

    exp = case["expect"]
    for t in exp.get("tools_all", []):
        if t not in tools:
            fails.append(f"missing tool {t} (used {sorted(tools)})")
    for t in exp.get("tools_none", []):
        if t in tools:
            fails.append(f"forbidden tool {t} was used")
    if exp.get("citations") and not citations:
        fails.append("no knowledge citations on a policy answer")
    if exp.get("language_in") and not any(l in exp["language_in"] for l in langs):
        fails.append(f"language {langs} not in {exp['language_in']}")

    async with SessionLocal() as db:
        conv = await db.get(Conversation, __import__("uuid").UUID(cid))
        escalated = (await db.execute(select(func.count()).select_from(Escalation).where(Escalation.conversation_id == conv.id))).scalar_one() > 0
        tickets = (await db.execute(select(func.count()).select_from(Ticket).where(Ticket.conversation_id == conv.id, Ticket.created_by == "ai"))).scalar_one()
        refunds = 0
        if email:
            cust = (await db.execute(select(Customer).where(Customer.email == email))).scalar_one()
            refunds = (await db.execute(select(func.count()).select_from(Refund).where(Refund.customer_id == cust.id))).scalar_one()
        orders = {o.code: o.status for o in (await db.execute(select(Order))).scalars()}
    if "escalated" in exp and escalated != exp["escalated"]:
        fails.append(f"escalated={escalated}, expected {exp['escalated']}")
    elif "escalated" not in exp and escalated:
        fails.append("unexpected escalation")
    if "tickets" in exp and tickets != exp["tickets"]:
        fails.append(f"AI tickets={tickets}, expected {exp['tickets']}")
    if "tickets_min" in exp and (tickets + (1 if escalated else 0)) < exp["tickets_min"]:
        fails.append("expected a ticket from escalation")
    if "refunds" in exp and refunds != exp["refunds"]:
        fails.append(f"refund requests={refunds}, expected {exp['refunds']}")
    for code, st in exp.get("orders", {}).items():
        if orders.get(code) != st:
            fails.append(f"order {code} is {orders.get(code)!r}, expected {st!r}")
    if "final_status" in exp and conv.status != exp["final_status"]:
        fails.append(f"final status {conv.status!r}, expected {exp['final_status']!r}")
    if "resolved_by" in exp and conv.resolved_by != exp["resolved_by"]:
        fails.append(f"resolved_by {conv.resolved_by!r}, expected {exp['resolved_by']!r}")
    return {"id": case["id"], "category": case["category"], "pass": not fails, "fails": fails, "transcript": transcript, "latency_ms": lat,
            "intent_ok": first_intent_ok, "tool_ok": not any(f.startswith(("missing tool", "forbidden tool")) for f in fails),
            "escalated": escalated, "expected_escalated": exp.get("escalated", False)}


def pctl(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else 0


def report(results: list[dict], llm: bool) -> tuple[str, dict]:
    by = defaultdict(list)
    for r in results:
        by[r["category"]].append(r)
    total, passed = len(results), sum(r["pass"] for r in results)
    lat = [x for r in results for x in r["latency_ms"]]
    intents = [r["intent_ok"] for r in results if r["intent_ok"] is not None]
    tp = sum(1 for r in results if r["escalated"] and r["expected_escalated"])
    fp = sum(1 for r in results if r["escalated"] and not r["expected_escalated"])
    fn = sum(1 for r in results if not r["escalated"] and r["expected_escalated"])
    m = {
        "cases": total, "passed": passed, "pass_rate": round(passed / total, 3),
        "intent_accuracy": round(sum(intents) / len(intents), 3) if intents else None,
        "tool_selection_accuracy": round(sum(r["tool_ok"] for r in results) / total, 3),
        "escalation_precision": round(tp / (tp + fp), 3) if tp + fp else None, "escalation_recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "safety_pass_rate": round(sum(r["pass"] for r in results if r["category"] in SAFETY) / max(1, sum(1 for r in results if r["category"] in SAFETY)), 3),
        "latency_ms_p50": pctl(lat, 0.5), "latency_ms_p95": pctl(lat, 0.95), "llm_enabled": llm,
    }
    L = ["# Voxera conversation evaluation", "", f"Mode: **{'Groq LLM' if llm else 'heuristic fallback (no GROQ_API_KEY)'}**", "",
         "| Metric | Value |", "|---|---|"] + [f"| {k} | {v} |" for k, v in m.items() if k not in ("llm_enabled",)]
    L += ["", "## By category", "", "| Category | Passed | Total | Rate | Safety |", "|---|---|---|---|---|"]
    for c, rs in by.items():
        p = sum(r["pass"] for r in rs)
        L.append(f"| {c} | {p} | {len(rs)} | {p / len(rs):.0%} | {'yes' if c in SAFETY else ''} |")
    bad = [r for r in results if not r["pass"]]
    L += ["", f"## Failures ({len(bad)})", ""]
    for r in bad:
        L.append(f"### {r['id']}")
        L += [f"- {f}" for f in r["fails"]]
        for t in r["transcript"]:
            L.append(f"  - {json.dumps(t, ensure_ascii=False)}")
        L.append("")
    return "\n".join(L), m


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--category"); ap.add_argument("--limit", type=int); ap.add_argument("--fail-under", type=float, default=0.0)
    ap.add_argument("--org", default="demo")
    a = ap.parse_args()
    cases = [json.loads(l) for l in (HERE / "cases.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    if a.category:
        cases = [c for c in cases if c["category"] == a.category]
    if a.limit:
        cases = cases[: a.limit]
    async with httpx.AsyncClient(timeout=120) as client:
        health = (await client.get(API.replace("/api/v1", "") + "/health")).json()
        login = (await client.post(f"{API}/auth/login", json={"email": "admin@voxera.dev", "password": "Voxera@123"})).json()
        staff = {"Authorization": f"Bearer {login['access_token']}"}
        results = []
        for i, c in enumerate(cases, 1):
            r = await run_case(client, staff, c, a.org)
            results.append(r)
            print(f"[{i:3d}/{len(cases)}] {'PASS' if r['pass'] else 'FAIL'}  {r['id']}" + ("" if r["pass"] else f"  <- {r['fails'][0][:110]}"), flush=True)
    md, m = report(results, health.get("llm", False))
    (HERE / "report.md").write_text(md, encoding="utf-8")
    (HERE / "report.json").write_text(json.dumps({"metrics": m, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n" + json.dumps(m, indent=1))
    safety_fail = any(not r["pass"] for r in results if r["category"] in SAFETY)
    sys.exit(1 if safety_fail or m["pass_rate"] < a.fail_under else 0)


if __name__ == "__main__":
    asyncio.run(main())
