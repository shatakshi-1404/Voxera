# Voxera frontend

React + TypeScript + Vite + Tailwind. Talks to the Voxera FastAPI backend through the Vite dev proxy (no CORS setup needed).

```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173  (backend must be running on :8000)
npm test             # unit tests
npm run build        # typecheck + production build
```

Backend elsewhere? `set VITE_BACKEND=http://host:8000` before `npm run dev`. For production behind one domain, route `/api` and `/health` to the backend and serve `dist/` (WebSockets must be proxied too).

## Try it
- Staff app: http://localhost:5173 → login prefilled with `admin@voxera.dev` / `Voxera@123`
- Customer chat: http://localhost:5173/chat/demo → email `ananya@example.com`, say "where is my order?", verify with `4821`
- Keep the Inbox open in another tab: messages, typing indicator, escalations and tickets arrive live.
- Say "I want to talk to a human" → conversation turns Escalated, AI stops; use Take over / Reply in the inbox.

## Screens
Overview · Inbox (3-column, realtime, takeover, notes, assign, ticket, escalate, resolve) · Voice Studio (LiveKit, waveform, pipeline states, barge-in indicator, transcript, history) · Tickets + Refund requests · Customers, Segments, Customer 360 · AI Playground (scenarios + pass/fail eval) · Knowledge Library · AI Configuration · Insights Studio · Team · Integrations · Settings · public chat widget.

Shortcuts: `g i` inbox, `g v` voice, `g t` tickets, `/` search, `Ctrl+Enter` send. Dark mode in the top bar.

## Design
"Obsidian Ember" (see `DESIGN_PROMPT.md`): dark by default (toggle in the top bar), ember/gold accents, Space Grotesk + Inter + JetBrains Mono, Framer Motion, a lazy-loaded Three.js orb on the login page and in Voice Studio with a CSS fallback.

## Deploying
Set `VITE_API_URL` to your deployed backend and redeploy (it is read at build time). See `../docs/DEPLOY.md`.
