# Go Fish Rummy

Online multiplayer for the Go Fish + Rummy hybrid: **sets only** (no runs), a discard **snake**, and asking opponents for ranks.

## Play locally

You need Node.js 20+.

```bash
npm install
npm test
npm run dev
```

Then open `http://localhost:5173`. Create a room, share the 5-character code, and have friends join.

- Same Wi-Fi: they can use your computer's local IP with port **5173** while `npm run dev` is running.
- **Different networks:** deploy the built app (one Node process serves the UI and the game server).

## Deploy (any Wi-Fi)

```bash
npm install
npm run build
npm start
```

The server listens on `PORT` (default `3001`) and serves `client/dist`. Put that on Render, Railway, Fly.io, or any VPS, then everyone connects to the public URL.

Optional: set `VITE_SERVER_URL` before `npm run build` only if the socket server is on a different origin than the web app.

## Rules encoded in the engine

- Melds are 3–4 of a kind. No runs.
- Turn: meld anytime, then **ask** (keep asking until you miss) or **take the snake**.
- Missed ask: draw. If it is the rank you asked for, show it and continue; otherwise discard and the turn ends.
- Taking the snake from any card also takes every card through the **tail**. After that you cannot ask.
- You only **go out** by discarding your last card.
- Empty hand but still in: snake, or ask only for an **open meld** (three on the table).
- Score: table cards you played minus cards left in hand. A=15; 10/J/Q/K=10; 2–9=5.
