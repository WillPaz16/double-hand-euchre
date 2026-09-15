# Deploying

One Cloudflare Worker serves both halves: the built client (`dist/`, via the static-assets
binding) and the multiplayer rooms (one Durable Object per room code). Runs on the **Workers
Free plan — $0**.

## How it fits together

```
browser ──► Worker (worker/index.ts)
              ├─ /health         → {"ok":true}
              ├─ /ws?code=TRUK   → Durable Object "TRUK" (worker/room-object.ts)
              └─ everything else → dist/ (SPA fallback to index.html)
```

**A room is a Durable Object.** `idFromName(code)` means Cloudflare runs exactly one instance of
a given room, globally. The Node server had to be pinned to a single machine to get that
guarantee; here the platform's addressing provides it.

**The room code is in the socket URL** because the Worker has to pick the right object before
the socket exists — it cannot read `hello` first. `hello` still carries the code, and the
object refuses a mismatch.

**Why it is free.** Sockets are accepted with the Hibernation API, so an idle connection (two
people thinking about a card) accrues no billable duration. Free-plan limits are 100k
requests/day, 13k GB-s/day and 5GB of SQLite storage; two people playing euchre will not come
near any of them. Only SQLite-backed Durable Objects are allowed on Free, which is what
`new_sqlite_classes` in `wrangler.jsonc` declares.

**Game rules are not here.** `shared/net/room.ts` is pure and unchanged; the Worker only moves
messages and runs clocks. The two clocks that were `setTimeout`s on Node (the pause before the
next deal, and sweeping an abandoned room after 10 minutes) are a single Durable Object alarm,
because a timer cannot survive the object being evicted and an alarm can.

## First deploy

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` builds the client (type-checking both the app and the Worker first) and runs
`wrangler deploy`. Wrangler prints the URL — `https://euchre.<your-subdomain>.workers.dev`.
To change the name, edit `"name"` in `wrangler.jsonc`.

That is the whole setup: no volume to create, no machine count to pin, no build variables. The
client derives its WebSocket URL from its own origin.

## Verifying a deploy

```bash
curl https://euchre.<your-subdomain>.workers.dev/health
npx wrangler tail          # live logs
```

Then open the app, "Play a Friend" → "Start a Table", and join that code from a second browser.
Both seats filling exercises the assets, the upgrade routing, and the Durable Object together.

The scripted equivalent runs every multiplayer check against any server:

```bash
SERVER_URL=wss://euchre.<your-subdomain>.workers.dev npx tsx scripts/smoke-multiplayer.ts
```

## Local development

```bash
npm run dev        # client with HMR, :5173
npm run worker     # Worker + Durable Objects under workerd, :8787 (needs a `npm run build` once)
```

Two processes because Vite's HMR and the Worker are different origins; `.env.development`
points the dev client at `:8787`. Solo play needs neither the Worker nor a network.

To run exactly what production runs, skip Vite and open `http://localhost:8787` after
`npm run build && npm run worker`. Local room state persists in `.wrangler/` across restarts,
the same way it does in Durable Object storage.

## Configuration

| Setting | Where | Notes |
|---|---|---|
| `name` | `wrangler.jsonc` | Becomes the `workers.dev` subdomain. |
| `ALLOWED_ORIGINS` | `wrangler.jsonc` `vars` | Comma-separated. Empty means allow any, which is correct: the Worker serves its own client, so there is one origin. Set it only if the client is ever hosted elsewhere. |

Limits that used to be env vars are constants at the top of `worker/room-object.ts`
(next-deal delay, empty-room TTL, payload cap, rate limit).
