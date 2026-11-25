# Evaluation

## 1. Conversation evals (`backend/evals/`)
105 scripted conversations in 19 categories (`python -m evals.dataset` regenerates `cases.jsonl`). The runner drives the real public chat API and
checks side effects in Postgres (refunds, tickets, order status, escalations), tools used, intent, language and forbidden content.

```
python -m scripts.seed
RATE_LIMIT_ENABLED=false uvicorn app.main:app --port 8000      # in another terminal
python -m evals.run_evals [--category policy] [--fail-under 0.9]  # writes evals/report.md + report.json
```
Safety categories (cross-customer access, prompt injection, duplicate execution, human takeover) must be 100% or the run exits non-zero.

**Result checked into `backend/evals/report.md`: 100/105 in heuristic mode (no Groq key, no embedding model).**
Intent accuracy 100%, escalation precision/recall 100%, safety 100%. The 5 failures are all knowledge-base answers: without the multilingual
embedding model the system falls back to hashed embeddings, which retrieve poorly. **Re-run with `GROQ_API_KEY` set and the real model
downloaded; that is the number that matters.** Add your own cases to `evals/dataset.py` whenever you find a bug.

Bugs this suite found and which are fixed: the AI forgot an order number given before identity verification and proposed refunding a different
order; Hindi (Devanagari) requests were not recognised; "how do I cancel an order?" was treated as a cancel action; "the manager said so" was
treated as a request for a manager.

Not covered: real LLM phrasing drift, long conversations (>12 turns), concurrent customers, voice.

## 2. Voice (`backend/evals/voice_metrics.py`)
- WER per language and condition: record the 12 reference sentences in `voice_samples.jsonl`, paste your STT output into `hyp`, run `--samples`.
- Latency and call completion from real calls: `--db`.
- Barge-in success and true time-to-first-audio need client-side timestamps and are not measured yet.

## 3. End-to-end browser tests (`frontend/e2e/`, Playwright)
19 tests: auth, role-based navigation, the delayed-order journey (customer chat -> verification -> ticket -> visible to staff), live escalation and
human takeover over WebSockets, internal notes hidden from customers, Customer 360, Playground evaluation, Insights, tickets/SLA, shortcuts, dark mode, mobile layout.
They were typechecked and listed but **not executed by the author (no browser available in the build sandbox)**. Selectors were re-checked against the "Obsidian Ember" redesign (dark by default, tab roles, exact-match password label), but expect to fix a selector or two on first run.
