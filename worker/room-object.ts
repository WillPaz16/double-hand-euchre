import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_CONFIG } from '../shared/engine/index.ts';
import type { CompletedTrick, Player } from '../shared/engine/types.ts';
import type { ClientId, ClientMessage, RoomCode, ServerMessage } from '../shared/net/protocol.ts';
import { CLOSE_REPLACED, cleanName, normaliseRoomCode, toLonerRules } from '../shared/net/protocol.ts';
import { toAvatarKey } from '../shared/net/avatars.ts';
import {
  advanceDeal,
  bothSeated,
  createRoom,
  disconnect,
  join,
  legalFor,
  needsDealAdvance,
  normaliseRoom,
  opponentAvatar,
  opponentName,
  opponentPresent,
  postChat,
  rulesViewFor,
  seatOf,
  submit,
  viewFor,
  voteRules,
  type Room,
} from '../shared/net/room.ts';

/**
 * ONE ROOM. That is the whole idea, and it is what the Node server could not have.
 *
 * On a single Node process every room lived in one shared `Map`, which forced the process to be
 * a singleton: two instances meant two disjoint sets of room codes and two players entering the
 * same code silently landing on different machines. Here the room code IS the object's identity
 * (`idFromName(code)` in the Worker), so Cloudflare guarantees exactly one instance of THIS
 * class for THIS code, globally, no matter how many edge locations are serving. The constraint
 * that used to be enforced by a line in fly.toml is now enforced by the platform's addressing.
 *
 * Still no game rules here. Every decision — who may sit, whether a move is legal, what each
 * player may see — is delegated to `shared/net/room.ts`, which is pure and unit-tested without
 * a socket in sight (tests/room.test.ts). That file did not change when the transport did,
 * which is the payoff for having kept it pure.
 *
 * The security property is unchanged and still rests on `submit()`: `legalActions(state, seat)`
 * returns [] for a player who is not on turn, so "is this action in the sender's own legal
 * list" answers authorisation and legality together. The seat comes from the CONNECTION, never
 * from the message body — here that means the socket's hibernation attachment, which is
 * written once at `hello` and never re-read from client input.
 */

/** Matches the single-player pacing in useGame — long enough to read the hand that just ended. */
const NEXT_DEAL_DELAY_MS = 2500;
/** A room nobody is connected to is erased after this long, so abandoned games do not sit in
 *  storage forever. On Fly this swept a Map; here it deletes the object's own storage, after
 *  which the object costs nothing and ceases to exist until someone names the code again. */
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
/** Hard ceiling on a single frame. Every message this protocol sends is a small JSON object;
 *  the largest is a `sync` carrying one redacted view. */
const MAX_PAYLOAD_BYTES = 16 * 1024;
/** Messages per connection per window. A real game sends a handful per turn; this only ever
 *  catches a loop or a flood. */
const MAX_MESSAGES_PER_WINDOW = 120;
const RATE_WINDOW_MS = 10_000;

/** What each socket carries across hibernation. `serializeAttachment` is the ONLY per-connection
 *  state that survives the object being evicted from memory, so the seat binding has to live
 *  here rather than in a closure the way it did on Node. Written once, at `hello`. */
interface Attachment {
  clientId: ClientId;
  seat: Player;
}

export class RoomObject extends DurableObject<Env> {
  /** Mirrors storage. Read on first use and written through on every mutation — the object can
   *  be evicted between messages, so this is a cache, never the source of truth. */
  private room: Room | null = null;

  /** Per-socket message budget. Deliberately in memory and deliberately NOT durable: making it
   *  survive hibernation would mean a storage write per message, which costs more than the
   *  flood it is guarding against. Eviction resets the budget, which is a real ceiling on this
   *  guard rather than a bug — the platform's own limits are what actually bound abuse here. */
  private budgets = new WeakMap<WebSocket, { start: number; count: number }>();

  /** Loads the room, creating it on first contact.
   *
   *  `code` is passed in from the Worker's URL rather than recovered from the object id, because
   *  `idFromName` is one-way: an object cannot ask what name it was addressed by. It is checked
   *  against `hello`'s own code by the caller, so the two can never disagree. */
  private async load(code: RoomCode): Promise<Room> {
    if (this.room) return this.room;
    const stored = await this.ctx.storage.get<Room>('room');
    // `normaliseRoom` because a room stored by an earlier deploy can predate fields added since
    // (rule agreement, chat) — and a room outlives a deploy by design.
    this.room = stored ? normaliseRoom(stored) : createRoom(code, freshSeed(), DEFAULT_CONFIG);
    return this.room;
  }

  /** The room if it exists, without creating one — for handlers that must not conjure a room
   *  into existence (an action or a close arriving for a code nobody has opened). */
  private async current(): Promise<Room | null> {
    if (this.room) return this.room;
    const stored = await this.ctx.storage.get<Room>('room');
    this.room = stored ? normaliseRoom(stored) : null;
    return this.room;
  }

  private async persist(room: Room): Promise<void> {
    this.room = room;
    await this.ctx.storage.put('room', room);
  }

  /** Pushes the authoritative state to every seated socket, each redacted for its own eyes.
   *  One function, called after every mutation — clients are never asked to derive anything. */
  private broadcast(room: Room, completedTrick: CompletedTrick | null = null): void {
    for (const ws of this.ctx.getWebSockets()) {
      const seat = attachmentOf(ws)?.seat;
      // A socket that has not said hello yet has no seat and therefore no view to receive.
      if (!seat) continue;
      send(ws, syncFor(room, seat, completedTrick));
    }
  }

  /** Broadcast, persist, and re-arm the clock. The Node version did this with `setTimeout`,
   *  which cannot survive hibernation — a timer belongs to a process, and this object is not
   *  one. `setAlarm` is the durable equivalent: it fires even if the object was evicted in the
   *  meantime, waking it and running `alarm()` below. */
  private async settle(room: Room, completedTrick: CompletedTrick | null = null): Promise<void> {
    await this.persist(room);
    this.broadcast(room, completedTrick);
    await this.rearm(room);
  }

  /** Works out when this object next needs to wake, and books exactly one alarm for it.
   *
   *  A Durable Object gets ONE alarm slot, but there are two clocks: the pause between hands,
   *  and the sweep of an abandoned room. So both deadlines live in storage and this picks the
   *  earlier — the standard way to multiplex a single alarm, and the reason `alarm()` below
   *  re-runs this after every firing rather than assuming it handled everything. */
  private async rearm(room: Room): Promise<void> {
    const now = Date.now();
    const seated = this.ctx.getWebSockets().some((ws) => attachmentOf(ws) !== null);

    const dealAt =
      needsDealAdvance(room) && bothSeated(room) ? now + NEXT_DEAL_DELAY_MS : null;
    const emptyAt = seated ? null : now + EMPTY_ROOM_TTL_MS;

    await this.ctx.storage.put({ dealAt, emptyAt });

    const next = [dealAt, emptyAt].filter((t): t is number => t !== null).sort((a, b) => a - b)[0];
    if (next === undefined) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  async fetch(request: Request): Promise<Response> {
    const code = normaliseRoomCode(new URL(request.url).searchParams.get('code') ?? '');
    if (!code) return new Response('Bad room code.', { status: 400 });
    // Ensures the room exists before any socket can talk to it, so `hello` never races creation.
    await this.load(code);

    const { 0: client, 1: server } = new WebSocketPair();
    // `acceptWebSocket`, NOT `server.accept()`: this is what puts the socket under the runtime's
    // control so the object can be evicted while the connection stays open. It is the entire
    // reason this deployment is free — an idle socket accrues no billable duration.
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (text.length > MAX_PAYLOAD_BYTES) {
      send(ws, { t: 'rejected', reason: 'Message too large.' });
      ws.close(1009, 'too large');
      return;
    }

    // Rolling window rather than per-second tracking: two numbers and no timer per socket.
    const now = Date.now();
    const budget = this.budgets.get(ws) ?? { start: now, count: 0 };
    if (now - budget.start > RATE_WINDOW_MS) {
      budget.start = now;
      budget.count = 0;
    }
    budget.count += 1;
    this.budgets.set(ws, budget);
    if (budget.count > MAX_MESSAGES_PER_WINDOW) {
      send(ws, { t: 'rejected', reason: 'Too many messages.' });
      ws.close(1008, 'rate limit');
      return;
    }

    const msg = parse(text);
    if (!msg) {
      send(ws, { t: 'rejected', reason: 'Unreadable message.' });
      return;
    }

    if (msg.t === 'hello') return this.hello(ws, msg);
    if (msg.t === 'chat') return this.chat(ws, msg);
    if (msg.t === 'rules_vote') return this.rulesVote(ws, msg);
    return this.action(ws, msg);
  }

  private async hello(ws: WebSocket, msg: ClientMessage & { t: 'hello' }): Promise<void> {
    const code = normaliseRoomCode(msg.code);
    if (!code) {
      send(ws, { t: 'rejected', reason: 'That is not a valid room code.' });
      return;
    }
    if (typeof msg.clientId !== 'string' || msg.clientId.length === 0) {
      send(ws, { t: 'rejected', reason: 'Missing client id.' });
      return;
    }

    const room = await this.load(code);
    // The URL routed this socket to THIS object; a `hello` naming a different room would be
    // asking this object to host a code that is not its own. Cannot happen from our client —
    // which is exactly why it is worth refusing loudly rather than quietly hosting it.
    if (room.code !== code) {
      send(ws, { t: 'rejected', reason: 'That room code does not match this connection.' });
      return;
    }

    // Names are cleaned server-side too: a client is free to send anything, and this is text
    // that will be rendered on someone ELSE's screen.
    const joined = join(
      room,
      msg.clientId,
      cleanName(msg.name),
      toAvatarKey(msg.avatar),
      toLonerRules(msg.rules),
    );
    if (!joined.ok) {
      send(ws, { t: 'rejected', reason: joined.error });
      return;
    }
    const seat = joined.value.seat;

    // A second connection for the same seat replaces the first (a reopened tab, or a reconnect
    // where the old socket has not dropped yet). Closing the stale one keeps exactly one socket
    // per seat, so `broadcast` can never write to a zombie. `CLOSE_REPLACED`, not a plain 1000:
    // a replaced client that reads this as an ordinary drop reconnects and evicts THIS socket in
    // turn, forever — see the constant's own note. A socket that is already dead ignores it.
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws && attachmentOf(other)?.seat === seat) {
        try {
          other.close(CLOSE_REPLACED, 'replaced');
        } catch {
          // Already closing. Nothing to replace.
        }
      }
    }

    ws.serializeAttachment({ clientId: msg.clientId, seat } satisfies Attachment);
    send(ws, { t: 'seated', seat, code });
    // History to THIS socket only: the other seat already has it. Sent on every seating, so a
    // reconnect or a reload comes back to the conversation rather than a blank log.
    send(ws, { t: 'chat_history', messages: joined.value.room.chat });
    await this.settle(joined.value.room);
  }

  private async chat(ws: WebSocket, msg: ClientMessage & { t: 'chat' }): Promise<void> {
    const bound = attachmentOf(ws);
    const room = await this.current();
    if (!bound || !room) {
      send(ws, { t: 'rejected', reason: 'Say hello before chatting.' });
      return;
    }
    const posted = postChat(room, bound.clientId, msg.text);
    if (!posted.ok) {
      send(ws, { t: 'rejected', reason: posted.error });
      return;
    }
    await this.persist(posted.value.room);
    // Both seats, the sender included: the sender's own log is built from what the server
    // accepted (cleaned, numbered), not from what they typed.
    for (const socket of this.ctx.getWebSockets()) {
      if (attachmentOf(socket)) send(socket, { t: 'chat', message: posted.value.message });
    }
  }

  private async rulesVote(ws: WebSocket, msg: ClientMessage & { t: 'rules_vote' }): Promise<void> {
    const bound = attachmentOf(ws);
    const room = await this.current();
    const rules = toLonerRules(msg.rules);
    if (!bound || !room || !rules) {
      send(ws, { t: 'rejected', reason: 'That rules choice could not be read.' });
      return;
    }
    const voted = voteRules(room, bound.clientId, rules);
    if (!voted.ok) {
      send(ws, { t: 'rejected', reason: voted.error });
      return;
    }
    // Settle rather than just persist: locking the rules is what makes the first moves legal,
    // so both seats need a fresh sync carrying their new legal actions.
    await this.settle(voted.value);
  }

  private async action(ws: WebSocket, msg: ClientMessage & { t: 'action' }): Promise<void> {
    const bound = attachmentOf(ws);
    if (!bound) {
      send(ws, { t: 'rejected', reason: 'Say hello before playing.' });
      return;
    }
    const room = await this.current();
    if (!room) {
      send(ws, { t: 'rejected', reason: 'That room is gone.' });
      return;
    }

    const result = submit(room, bound.clientId, msg.action);
    if (!result.ok) {
      // Rejection is not fatal: the move simply did not happen. Resync the sender so a client
      // that believed otherwise is corrected rather than left guessing.
      send(ws, { t: 'rejected', reason: result.error });
      send(ws, syncFor(room, bound.seat, null));
      return;
    }
    await this.settle(result.value.room, result.value.completedTrick);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.dropped(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropped(ws);
  }

  private async dropped(ws: WebSocket): Promise<void> {
    const bound = attachmentOf(ws);
    if (!bound) return;
    const room = await this.current();
    if (!room) return;

    // A socket that was already REPLACED must not unseat the connection that replaced it. On
    // Node this compared against a socket map; here the live set is the runtime's own, so the
    // question is whether some OTHER socket already holds this seat. Same bug, same guard: a
    // stale close used to mark the seat away while a healthy socket was sitting there, and the
    // opponent saw "waiting for the other player" over a board that was actually live.
    const seat = seatOf(room, bound.clientId);
    if (!seat) return;
    const replaced = this.ctx
      .getWebSockets()
      .some((other) => other !== ws && attachmentOf(other)?.seat === seat);
    if (replaced) return;

    await this.settle(disconnect(room, bound.clientId));
  }

  /** The single alarm slot, shared by both clocks — see `rearm`. Re-arms itself at the end
   *  rather than assuming one firing settled everything, because the two deadlines are
   *  independent and only the earlier one was booked. */
  async alarm(): Promise<void> {
    const now = Date.now();
    const { dealAt, emptyAt } = await this.ctx.storage.get<number | null>(['dealAt', 'emptyAt'])
      .then((m) => ({ dealAt: m.get('dealAt') ?? null, emptyAt: m.get('emptyAt') ?? null }));

    const seated = this.ctx.getWebSockets().some((ws) => attachmentOf(ws) !== null);
    if (emptyAt !== null && now >= emptyAt && !seated) {
      // Nobody has been here for the whole TTL. Erasing storage is what makes an abandoned room
      // cost nothing: with no state and no alarm the object simply stops existing.
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }

    let room = await this.current();
    if (!room) return;
    if (dealAt !== null && now >= dealAt && needsDealAdvance(room) && bothSeated(room)) {
      room = advanceDeal(room, freshSeed());
    }
    await this.settle(room);
  }
}

function freshSeed(): string {
  return `deal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function attachmentOf(ws: WebSocket): Attachment | null {
  return (ws.deserializeAttachment() as Attachment | null) ?? null;
}

function syncFor(room: Room, seat: Player, completedTrick: CompletedTrick | null): ServerMessage {
  return {
    t: 'sync',
    view: viewFor(room, seat),
    legal: legalFor(room, seat),
    opponentPresent: opponentPresent(room, seat),
    completedTrick,
    opponentName: opponentName(room, seat),
    opponentAvatar: opponentAvatar(room, seat),
    rules: rulesViewFor(room, seat),
  };
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Writing to a socket the runtime has already torn down is not an error worth propagating:
    // `webSocketClose` is what cleans the seat up, and it will run regardless.
  }
}

function parse(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw) as unknown;
    if (typeof msg !== 'object' || msg === null || !('t' in msg)) return null;
    const t = (msg as { t: unknown }).t;
    if (t === 'hello' || t === 'action' || t === 'chat' || t === 'rules_vote') {
      return msg as ClientMessage;
    }
    return null;
  } catch {
    return null;
  }
}
