# Deploying

One Fly.io app serves both halves: the built client (`dist/`) and the WebSocket server, from a
single Node process on a single machine.

## Why one machine, and why that is not a shortcut

Rooms live in the server process's memory. Two instances are two disjoint sets of room codes —
two players entering the same code land on different machines and never see each other, and
nothing in the protocol can detect or report it. So the app runs at a count of exactly **one**,
and `fly.toml` is written around that constraint (`auto_stop_machines = 'off'`,
`min_machines_running = 1`).

If this ever needs to outgrow one box, the right shape is Cloudflare Durable Objects — a room
is exactly a durable object — and that is a rewrite of `server/index.ts`, not a config change.
For two people playing euchre, one machine is correct and will stay correct for a long time.

## Why the client ships with the server

Same origin means the client derives its own WebSocket URL from `location` instead of having
one baked in at build time. That removes both of the deploy mistakes this codebase previously
needed guard code for: a build that forgets `VITE_SERVER_URL` (it has no such requirement now)
and an `ALLOWED_ORIGINS` that does not match the client's real origin (there is only one
origin, so it can stay unset).

The trade is honest: the game page is down while the server redeploys. A redeploy takes a few
seconds and drops in-progress games anyway, so it costs nothing that was not already lost.

## First deploy

`flyctl` builds remotely, so no local Docker is needed.

```bash
brew install flyctl
fly auth login
```

**Pick a unique app name.** Fly app names are global, and `euchre` is almost certainly taken.
Choose one, then set it in `fly.toml`'s `app = '...'` line — it becomes your URL,
`https://<name>.fly.dev`.

```bash
fly apps create your-euchre-name
```

Create the volume before the first deploy, in the same region as `primary_region` in
`fly.toml`. It holds `rooms.json`, so in-progress games survive a restart:

```bash
fly volumes create euchre_data --region ord --size 1 --app your-euchre-name
```

Deploy. **`--ha=false` matters** — without it Fly provisions a second standby machine, which is
the split-brain failure described above:

```bash
fly deploy --ha=false
fly scale count 1      # confirm; should report 1 machine
fly open
```

## Subsequent deploys

```bash
fly deploy
```

`fly scale count 1` is worth re-checking after any change to `fly.toml`.

## Verifying a deploy

```bash
curl https://your-euchre-name.fly.dev/health     # {"ok":true,"rooms":N}
fly logs
```

Then open the app, start a game from "Play a Friend", and open the same room code in a second
browser. Both seats filling is the end-to-end check — it exercises the HTTP serving, the
WebSocket upgrade, and the room store in one go.

## Local development

Two processes, because in dev the client is served by Vite on `:5173` and the server runs
separately on `:8787` — two different origins, which is why `.env.development` overrides the
same-origin default with `VITE_SERVER_URL=ws://localhost:8787`.

```bash
npm run dev        # client, :5173
npm run server     # game server, :8787   (only needed for "Play a Friend")
```

Solo play needs no server at all.

## Testing the production path locally

This runs exactly what Fly runs — the bundled server serving the real built client:

```bash
npm run build:all
npm start          # :8787, serving dist/ and the WebSocket on one origin
```

## Configuration

Every one of these has a working default. `fly.toml` sets the first two.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8787` | Must match `internal_port` in `fly.toml`. |
| `ROOMS_FILE` | `.rooms.json` | Set to `/data/rooms.json` in `fly.toml` so it lands on the volume. `saveRooms` writes `<file>.tmp` and renames, so this must be a path whose directory is writable. |
| `CLIENT_DIR` | `dist` | Where the built client is. If it is missing, the server serves only `/health` and the WebSocket — which is what happens in development. |
| `HEARTBEAT_MS` | `30000` | Ping interval; a socket that misses one is terminated. |
| `ALLOWED_ORIGINS` | unset (allow any) | Comma-separated. Unnecessary in the single-app deploy above, since client and server share an origin. Set it if you ever serve the client from somewhere else. |
