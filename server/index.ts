/**
 * The authoritative multiplayer server.
 *
 * It deliberately contains NO game rules. Every decision — who may sit, whether a move is
 * legal, what each player is allowed to see — is delegated to `shared/net/room.ts`, which is
 * pure and unit-tested without a socket in sight (tests/room.test.ts). What lives here is only
 * what a pure function cannot do: hold connections, hold the room map, and run clocks.
 *
 * The security property this rests on is stated once, in `submit()`: `legalActions(state, seat)`
 * returns [] for a player who is not on turn, so "is this action in the sender's own legal
 * list" answers authorisation and legality together. The server never trusts a client's claim
 * about who it is — the seat comes from the connection, never from the message body, which
 * matters because PLAY_CARD and DEALER_DISCARD carry no player field at all.
 *
 * State is in memory and rooms die with the process. That is a deliberate first cut, not an
 * oversight: a restart during a game loses that game. Persisting rooms is the obvious next step
 * if these games are meant to outlive a deploy.
 */
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_CONFIG } from '../shared/engine/index.ts';
import type { CompletedTrick, Player } from '../shared/engine/types.ts';
import type { ClientId, ClientMessage, RoomCode, ServerMessage } from '../shared/net/protocol.ts';
import { cleanName, normaliseRoomCode } from '../shared/net/protocol.ts';
import { toAvatarKey } from '../shared/net/avatars.ts';
import {
  advanceDeal,
  bothSeated,
  createRoom,
  disconnect,
  join,
  legalFor,
  needsDealAdvance,
  opponentAvatar,
  opponentName,
  opponentPresent,
  seatOf,
  submit,
  viewFor,
  type Room,
} from '../shared/net/room.ts';
import { loadRooms, saveRooms } from './store.ts';

const PORT = Number(process.env.PORT) || 8787;
/** Hard ceiling on a single frame. Every message this protocol sends is a small JSON object;
 *  the largest is a `sync` carrying one redacted view. Without a cap, one client can hand the
 *  process an arbitrarily large buffer before a single line of our code runs. */
const MAX_PAYLOAD_BYTES = 16 * 1024;
/** A socket that stops answering pings is gone, whatever TCP still believes.
 *
 *  This is the gap that mattered most. `close` only fires on an orderly shutdown; a phone
 *  going into a tunnel, a laptop lid closing, a NAT dropping the mapping — none of those send
 *  a close frame. The seat stayed `connected: true` forever, so the opponent never saw
 *  "waiting for them to come back", the room never went empty, and `EMPTY_ROOM_TTL_MS` never
 *  started counting because `emptySince` is only set in the close handler. The room leaked and
 *  the game looked live from the other side.
 *
 *  Overridable so it can actually be exercised: at 30s a test either waits half a minute or
 *  asserts nothing, and "asserts nothing" is what a heartbeat bug looks like. */
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) || 30_000;
/** Rooms are tiny, but unbounded: any client can mint a new one by naming a code nobody is
 *  using. This is what stops a stranger filling memory with empty rooms. */
const MAX_ROOMS = 500;
/** Messages per connection per window. A real game sends a handful per turn; this only ever
 *  catches a loop or a flood. */
const MAX_MESSAGES_PER_WINDOW = 120;
const RATE_WINDOW_MS = 10_000;
/** Matches the single-player pacing in useGame — long enough to read the hand that just ended. */
const NEXT_DEAL_DELAY_MS = 2500;
/** A room with nobody connected is swept after this long, so abandoned games don't leak. */
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

interface Live {
  room: Room;
  /** Sockets by seat. A seat can be owned (room.seats) while its socket is gone. */
  sockets: Partial<Record<Player, WebSocket>>;
  dealTimer?: ReturnType<typeof setTimeout>;
  emptySince?: number;
}

/** Rooms restored from the last snapshot, each with no sockets: the games are back, their
 *  players are not, until each client reconnects and reclaims its seat by clientId. */
const rooms = new Map<RoomCode, Live>();
for (const [code, room] of loadRooms()) rooms.set(code, { room, sockets: {} });

/** Snapshots are debounced rather than written on every mutation. A busy hand is several
 *  messages a second and each write is a full serialise-and-rename; coalescing them costs at
 *  most this long of progress in a crash, which for a card game is a fraction of one turn. */
const SAVE_DEBOUNCE_MS = 1000;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveRooms(new Map([...rooms].map(([code, live]) => [code, live.room])));
  }, SAVE_DEBOUNCE_MS);
}

function freshSeed(): string {
  return `deal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

/** Pushes the authoritative state to every connected seat, each redacted for its own eyes.
 *  One function, called after every mutation — clients are never asked to derive anything. */
function broadcast(live: Live, completedTrick: CompletedTrick | null = null): void {
  for (const seat of ['A', 'B'] as const) {
    const socket = live.sockets[seat];
    if (!socket) continue;
    send(socket, {
      t: 'sync',
      view: viewFor(live.room, seat),
      legal: legalFor(live.room, seat),
      opponentPresent: opponentPresent(live.room, seat),
      completedTrick,
      opponentName: opponentName(live.room, seat),
      opponentAvatar: opponentAvatar(live.room, seat),
    });
  }
}

/** Schedules the next deal once a hand settles.
 *
 *  The server owns WHETHER the game advances; the delay exists purely so players can read the
 *  hand that just finished. Re-armed from scratch after every mutation, and cleared whenever
 *  the room is no longer waiting, so a reconnect mid-countdown cannot leave two timers running
 *  and skip a deal. */
function armDealTimer(live: Live): void {
  if (live.dealTimer) {
    clearTimeout(live.dealTimer);
    live.dealTimer = undefined;
  }
  if (!needsDealAdvance(live.room) || !bothSeated(live.room)) return;
  live.dealTimer = setTimeout(() => {
    live.dealTimer = undefined;
    live.room = advanceDeal(live.room, freshSeed());
    broadcast(live);
    armDealTimer(live);
  }, NEXT_DEAL_DELAY_MS);
}

function settle(live: Live, completedTrick: CompletedTrick | null = null): void {
  broadcast(live, completedTrick);
  armDealTimer(live);
  scheduleSave();
}

function parse(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw) as unknown;
    if (typeof msg !== 'object' || msg === null || !('t' in msg)) return null;
    const t = (msg as { t: unknown }).t;
    if (t === 'hello' || t === 'action') return msg as ClientMessage;
    return null;
  } catch {
    return null;
  }
}

const httpServer = createServer((req, res) => {
  // A trivial health endpoint, so a platform health check has something to hit that is not a
  // WebSocket upgrade.
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

/** Origins allowed to open a socket, as a comma-separated env var. UNSET MEANS ALLOW ANY,
 *  which is the right default for local development and for a server nobody has told where its
 *  client lives.
 *
 *  What this does and does not buy is worth being honest about. There are no credentials here
 *  and no cookies, so it is not CSRF protection — a seat is claimed by a clientId the caller
 *  invents, and anyone who knows a four-letter room code can join from anywhere regardless.
 *  What it does stop is an unrelated page quietly opening sockets against this server, which
 *  is the difference between "a stranger who has a room code" and "any site a player visits".
 *  Cheap, honest about its limits, and off unless configured. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function originAllowed(origin: string | undefined): boolean {
  if (ALLOWED_ORIGINS.length === 0) return true;
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: ({ origin }, done) => {
    if (originAllowed(origin)) return done(true);
    // 403 rather than a silent drop, so a misconfigured ALLOWED_ORIGINS is diagnosable from
    // the client side instead of looking like the server is down.
    done(false, 403, 'Origin not allowed');
  },
});

/** Liveness per socket, kept outside the socket object so `ws`'s own types stay untouched. */
const alive = new WeakMap<WebSocket, boolean>();

setInterval(() => {
  for (const socket of wss.clients) {
    if (alive.get(socket) === false) {
      // Missed a full interval. `terminate` rather than `close`: the point of being here is
      // that the peer is not answering, so waiting on a close handshake waits forever.
      socket.terminate();
      continue;
    }
    alive.set(socket, false);
    socket.ping();
  }
}, HEARTBEAT_MS).unref();

wss.on('connection', (socket) => {
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  // Per-connection message budget. Reset on a rolling window rather than tracked per second,
  // which keeps it to two numbers and no timer per socket.
  let windowStart = Date.now();
  let messagesInWindow = 0;
  // Bound at `hello` and never re-read from message bodies afterwards — this pair IS the
  // client's identity for the life of the connection.
  let boundCode: RoomCode | null = null;
  let boundClient: ClientId | null = null;
  let boundSeat: Player | null = null;

  socket.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart > RATE_WINDOW_MS) {
      windowStart = now;
      messagesInWindow = 0;
    }
    if (++messagesInWindow > MAX_MESSAGES_PER_WINDOW) {
      send(socket, { t: 'rejected', reason: 'Too many messages.' });
      socket.close();
      return;
    }

    const msg = parse(String(data));
    if (!msg) {
      send(socket, { t: 'rejected', reason: 'Unreadable message.' });
      return;
    }

    if (msg.t === 'hello') {
      const code = normaliseRoomCode(msg.code);
      if (!code) {
        send(socket, { t: 'rejected', reason: 'That is not a valid room code.' });
        return;
      }
      if (typeof msg.clientId !== 'string' || msg.clientId.length === 0) {
        send(socket, { t: 'rejected', reason: 'Missing client id.' });
        return;
      }

      let live = rooms.get(code);
      if (!live && rooms.size >= MAX_ROOMS) {
        // Refuse to MINT a new room, never to join an existing one: a full server must not
        // lock out the games already running on it.
        send(socket, { t: 'rejected', reason: 'The server is full right now. Try again soon.' });
        return;
      }
      if (!live) {
        live = { room: createRoom(code, freshSeed(), DEFAULT_CONFIG), sockets: {} };
        rooms.set(code, live);
      }

      // Names are cleaned server-side too: a client is free to send anything, and this is
      // text that will be rendered on someone ELSE's screen.
      const joined = join(live.room, msg.clientId, cleanName(msg.name), toAvatarKey(msg.avatar));
      if (!joined.ok) {
        send(socket, { t: 'rejected', reason: joined.error });
        return;
      }
      live.room = joined.value.room;
      const seat = joined.value.seat;

      // A second connection for the same client replaces the first (a reopened tab, or a
      // reconnect where the old socket has not timed out yet). Closing the stale one keeps
      // exactly one socket per seat, so `broadcast` can never write to a zombie.
      const previous = live.sockets[seat];
      if (previous && previous !== socket) previous.close();
      live.sockets[seat] = socket;
      live.emptySince = undefined;

      boundCode = code;
      boundClient = msg.clientId;
      boundSeat = seat;

      send(socket, { t: 'seated', seat, code });
      settle(live);
      return;
    }

    // msg.t === 'action'
    if (!boundCode || !boundClient || !boundSeat) {
      send(socket, { t: 'rejected', reason: 'Say hello before playing.' });
      return;
    }
    const live = rooms.get(boundCode);
    if (!live) {
      send(socket, { t: 'rejected', reason: 'That room is gone.' });
      return;
    }
    const result = submit(live.room, boundClient, msg.action);
    if (!result.ok) {
      // Rejection is not fatal: the move simply did not happen. Resync the sender so a client
      // that believed otherwise is corrected rather than left guessing.
      send(socket, { t: 'rejected', reason: result.error });
      send(socket, {
        t: 'sync',
        view: viewFor(live.room, boundSeat),
        legal: legalFor(live.room, boundSeat),
        opponentPresent: opponentPresent(live.room, boundSeat),
        completedTrick: null,
        opponentName: opponentName(live.room, boundSeat),
        opponentAvatar: opponentAvatar(live.room, boundSeat),
      });
      return;
    }
    live.room = result.value.room;
    settle(live, result.value.completedTrick);
  });

  socket.on('close', () => {
    if (!boundCode || !boundClient) return;
    const live = rooms.get(boundCode);
    if (!live) return;
    const seat = seatOf(live.room, boundClient);
    // A replaced socket closing later must not unseat the connection that replaced it. This
    // guard has to cover the DISCONNECT as well as the socket map, which is the bug it was
    // written for and originally only half-fixed: `disconnect()` ran unconditionally, so a
    // stale close marked the seat away while a perfectly healthy socket was sitting in
    // `live.sockets`. The opponent then saw "waiting for the other player" over a board that
    // was actually live. Reproduced with two clients where one had reconnected; it also fires
    // in React StrictMode, whose deliberate mount/unmount/remount makes every dev session
    // replace its socket once.
    if (!seat || live.sockets[seat] !== socket) return;
    delete live.sockets[seat];
    live.room = disconnect(live.room, boundClient);
    if (Object.keys(live.sockets).length === 0) live.emptySince = Date.now();
    settle(live);
  });
});

/** Sweeps rooms nobody has been connected to for a while. Without this, every abandoned room
 *  code stays in memory for the life of the process. */
setInterval(() => {
  const now = Date.now();
  for (const [code, live] of rooms) {
    if (live.emptySince && now - live.emptySince > EMPTY_ROOM_TTL_MS) {
      if (live.dealTimer) clearTimeout(live.dealTimer);
      rooms.delete(code);
      scheduleSave();
    }
  }
}, 60_000).unref();

/** Flush on the way out so an ordinary restart (deploy, Ctrl-C) loses nothing at all, rather
 *  than up to one debounce window. `once` per signal: a second Ctrl-C should still kill it. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveRooms(new Map([...rooms].map(([code, live]) => [code, live.room])));
    process.exit(0);
  });
}

httpServer.listen(PORT, () => {
  console.log(`euchre server listening on :${PORT}`);
});
