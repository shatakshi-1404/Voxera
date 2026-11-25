# Voxera UI v3 — "Obsidian Ember" (design prompt used)

Restyle the existing Voxera React frontend only. Do not touch routes, API calls, auth, WebSocket, LiveKit or store logic.
Borrow the *structure* of a premium dark futuristic engineering UI (floating glass nav, ambient glows, editorial headlines, mono eyebrow labels, thin borders, a 3D hero) but NOT its violet/cyan palette.

Palette: bg #0C0A09 · surface #1A1613 · text #F6F1EA · muted #A39B90 · accent ember #FF7A45 · secondary gold #FFC857 · success/highlight mint #5EEAD4 · danger #FF5C7A · border ≈ white 9%.
Type: Space Grotesk (display), Inter (body), JetBrains Mono (eyebrows/labels).
Motion: Framer Motion, 150/220/320 ms, one easing; respect reduced motion; 3D only on login + Voice Studio, lazy-loaded, paused off-screen, CSS fallback.
