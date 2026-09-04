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
import { normaliseRoomCode } from '../shared/net/protocol.ts';
import {
  advanceDeal,
  bothSeated,
  createRoom,
  disconnect,
  join,
  legalFor,
  needsDealAdvance,
  opponentPresent,
  seatOf,
  submit,
  viewFor,
  type Room,
} from '../shared/net/room.ts';

const PORT = Number(process.env.PORT) || 8787;
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

const rooms = new Map<RoomCode, Live>();

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

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
  // Bound at `hello` and never re-read from message bodies afterwards — this pair IS the
  // client's identity for the life of the connection.
  let boundCode: RoomCode | null = null;
  let boundClient: ClientId | null = null;
  let boundSeat: Player | null = null;

  socket.on('message', (data) => {
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
      if (!live) {
        live = { room: createRoom(code, freshSeed(), DEFAULT_CONFIG), sockets: {} };
        rooms.set(code, live);
      }

      const joined = join(live.room, msg.clientId);
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
    }
  }
}, 60_000).unref();

httpServer.listen(PORT, () => {
  console.log(`euchre server listening on :${PORT}`);
});
