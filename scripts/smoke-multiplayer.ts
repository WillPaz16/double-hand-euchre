/**
 * End-to-end smoke test for the multiplayer server.
 *
 * `tests/room.test.ts` proves the RULES of a room with no socket in sight. This proves the part
 * a unit test structurally cannot: that two real WebSocket clients find each other, that the
 * server attributes each move to the connection it arrived on, and that a dropped client gets
 * its own seat and its own cards back. Those failures only exist once there is a wire.
 *
 * Run: `npm run worker` in one shell, `npx tsx scripts/smoke-multiplayer.ts` in another. Against a
 * deployed site: `SERVER_URL=wss://doublehand.willpaz16.workers.dev npx tsx scripts/...`. CI runs
 * both — against `wrangler dev` on every push, and against the live URL right after each deploy.
 */
import { WebSocket } from 'ws';
import { makeRoomCode, type ClientMessage, type ServerMessage } from '../shared/net/protocol.ts';
import type { Action, Player } from '../shared/engine/types.ts';

const URL = process.env.SERVER_URL ?? 'ws://localhost:8787';
// Fresh codes every run, drawn from the real code alphabet. Fixed codes ("SMKE", "TR2K") broke two
// ways: a hand-picked spelling can use an excluded glyph (the first attempt was "SMOK", and `O`
// isn't allowed), and against a DEPLOYED server a room persists between runs — the next run would
// rejoin a half-played or finished game and fail for reasons that have nothing to do with the code.
const CODE = process.env.ROOM_CODE ?? makeRoomCode();
let fullHandCode = makeRoomCode();
while (fullHandCode === CODE) fullHandCode = makeRoomCode();

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A test client that queues every message so a waiter can consume them in order. */
class Client {
  private socket: WebSocket;
  private queue: ServerMessage[] = [];
  seat: Player | null = null;

  // The room code is part of the URL because the Worker routes each socket to its room's
  // Durable Object before any message has been sent.
  constructor(readonly clientId: string, code: string = CODE) {
    this.socket = new WebSocket(`${URL}/ws?code=${code}`);
    this.socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      if (msg.t === 'seated') this.seat = msg.seat;
      this.queue.push(msg);
    });
  }

  open(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((res, rej) => {
      this.socket.once('open', () => res());
      this.socket.once('error', rej);
    });
  }

  send(msg: ClientMessage): void {
    this.socket.send(JSON.stringify(msg));
  }

  /** Waits for the next message of a given type. Polls the queue rather than racing a
   *  listener, because a `sync` can arrive at any moment simply because the opponent moved. */
  async next<T extends ServerMessage['t']>(
    t: T,
    timeoutMs = 3000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const idx = this.queue.findIndex((m) => m.t === t);
      if (idx >= 0) {
        const [found] = this.queue.splice(idx, 1);
        return found as Extract<ServerMessage, { t: T }>;
      }
      // Surface a refusal instead of timing out on it. Waiting for `seated` while the server
      // has already said "that is not a valid room code" otherwise fails as a bare timeout,
      // which says nothing about the actual cause — hit three times during development, every
      // time by putting an excluded glyph (0/O/1/I) in a test room code.
      if (t !== 'rejected') {
        const refusal = this.queue.find((m) => m.t === 'rejected');
        if (refusal && refusal.t === 'rejected') {
          throw new Error(`server refused while awaiting ${t}: ${refusal.reason}`);
        }
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${t}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  /** Most recent sync already received, if any. */
  lastSync(): Extract<ServerMessage, { t: 'sync' }> | null {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const m = this.queue[i]!;
      if (m.t === 'sync') return m;
    }
    return null;
  }

  close(): void {
    this.socket.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`smoke test against ${URL}, room ${CODE}`);

  const a = new Client('smoke-a');
  const b = new Client('smoke-b');
  await Promise.all([a.open(), b.open()]);

  a.send({ t: 'hello', code: CODE, clientId: a.clientId });
  const seatedA = await a.next('seated');
  b.send({ t: 'hello', code: CODE, clientId: b.clientId });
  const seatedB = await b.next('seated');

  check(
    'two clients get different seats',
    seatedA.seat !== seatedB.seat,
    `${seatedA.seat}/${seatedB.seat}`,
  );

  // Let the post-join broadcast land for both.
  await sleep(200);
  const syncA = a.lastSync();
  const syncB = b.lastSync();
  check('both seats receive a sync', !!syncA && !!syncB);
  if (!syncA || !syncB) throw new Error('no sync received');

  check('sync carries a view redacted for its recipient', syncA.view.you === seatedA.seat);
  check('sync never carries the opponent hand mid-deal', syncA.view.opponentSelectedHand === null);
  check('both seats see each other present', syncA.opponentPresent && syncB.opponentPresent);

  // Ask the SERVER who is on turn rather than assuming a seat.
  const onTurn = syncA.legal.length > 0 ? a : b;
  const offTurn = onTurn === a ? b : a;
  const onTurnSync = onTurn === a ? syncA : syncB;
  const offTurnSync = onTurn === a ? syncB : syncA;
  check(
    'exactly one seat is offered moves',
    onTurnSync.legal.length > 0 && offTurnSync.legal.length === 0,
  );

  const move: Action | undefined = onTurnSync.legal[0];
  if (!move) throw new Error('server offered no legal move');

  // The cheat: the off-turn client sends the on-turn client's move.
  offTurn.send({ t: 'action', action: move });
  const refused = await offTurn.next('rejected');
  check("a seat cannot play the other seat's move", /not legal/i.test(refused.reason), refused.reason);

  // The rightful client sends the same move.
  //
  // Asserted by the TURN PASSING, not by the view changing. The obvious check — "the mover's
  // view is now different" — is wrong here and quietly so: the opening move is SELECT_HAND, and
  // `redact()` deliberately keeps your own chosen packet hidden during `select` (a selected hand
  // only becomes visible once `actingHand` is set, at dealer_exchange/play). So a correctly
  // applied first move leaves the mover's own view byte-identical. What definitely changes is
  // who the server will accept moves from next.
  onTurn.send({ t: 'action', action: move });
  await sleep(250);
  const moverAfter = onTurn.lastSync();
  const otherAfter = offTurn.lastSync();
  check(
    "the rightful seat's move is applied (the turn passes)",
    !!moverAfter && moverAfter.legal.length === 0 && !!otherAfter && otherAfter.legal.length > 0,
    `mover legal=${moverAfter?.legal.length}, other legal=${otherAfter?.legal.length}`,
  );

  // Reconnect: drop a client and come back with the same clientId.
  const seatBefore = onTurn.seat;
  onTurn.close();
  await sleep(250);
  const returning = new Client(onTurn.clientId);
  await returning.open();
  returning.send({ t: 'hello', code: CODE, clientId: onTurn.clientId });
  const reseated = await returning.next('seated');
  check(
    'a reconnecting client reclaims its own seat',
    reseated.seat === seatBefore,
    `${seatBefore} -> ${reseated.seat}`,
  );

  const resync = await returning.next('sync');
  check('the returning client is resynced with its own view', resync.view.you === seatBefore);

  // A third party cannot take a held seat.
  const intruder = new Client('smoke-intruder');
  await intruder.open();
  intruder.send({ t: 'hello', code: CODE, clientId: intruder.clientId });
  const blocked = await intruder.next('rejected');
  check('a third client is refused', /two players/i.test(blocked.reason), blocked.reason);

  returning.close();
  offTurn.close();
  intruder.close();

  await playAFullTrick();

  console.log(failures === 0 ? '\nsmoke test passed' : `\nsmoke test FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

/** Drives two clients through bidding into real card play, far enough to complete a trick.
 *
 *  This is the check that matters most for the wire format, because a completed trick is the
 *  one piece of state a client provably CANNOT derive: the engine appends the winning card and
 *  sweeps the trick in the same call, so it appears in no state any client ever receives. If
 *  the server does not send it, a remote player simply never sees which card took the trick.
 *  Nothing short of playing a real hand exercises that. */
async function playAFullTrick(): Promise<void> {
  console.log('\n  -- driving a full hand --');
  const code = fullHandCode;
  const p1 = new Client('full-a', code);
  const p2 = new Client('full-b', code);
  await Promise.all([p1.open(), p2.open()]);
  p1.send({ t: 'hello', code, clientId: p1.clientId });
  await p1.next('seated');
  p2.send({ t: 'hello', code, clientId: p2.clientId });
  await p2.next('seated');
  await sleep(250);

  let completed = null as null | { winner: string; cards: unknown[] };
  let reachedPlay = false;

  // Play whichever seat is on turn, always taking the first legal action. Bounded so a rules
  // bug shows up as a failed assertion rather than a hung script.
  for (let step = 0; step < 120; step++) {
    const s1 = p1.lastSync();
    const s2 = p2.lastSync();
    if (s1?.view.phase === 'play' || s2?.view.phase === 'play') reachedPlay = true;
    for (const s of [s1, s2]) {
      if (s?.completedTrick && !completed) {
        completed = { winner: s.completedTrick.winner, cards: s.completedTrick.cards };
      }
    }
    if (completed) break;

    const actor = s1 && s1.legal.length > 0 ? p1 : s2 && s2.legal.length > 0 ? p2 : null;
    if (!actor) {
      await sleep(120); // waiting on a server-side deal advance
      continue;
    }
    const sync = actor === p1 ? s1! : s2!;
    actor.send({ t: 'action', action: sync.legal[0]! });
    await sleep(120);
  }

  check('the hand reaches the play phase', reachedPlay);
  check('a completed trick is delivered over the wire', completed !== null);
  if (completed) {
    check(
      'the completed trick carries every card played to it',
      completed.cards.length >= 2,
      `${completed.cards.length} cards, winner ${completed.winner}`,
    );
  }

  p1.close();
  p2.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
