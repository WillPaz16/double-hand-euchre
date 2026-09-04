import {
  actingHand,
  legalActions,
  newGame,
  nextDeal,
  reduce,
  redact,
  sameAction,
  trickWinnerIndex,
} from '../engine/index.ts';
import type {
  Action,
  CompletedTrick,
  Config,
  GameState,
  Player,
  PlayerView,
  TrickCard,
} from '../engine/types.ts';
import type { ClientId, RoomCode } from './protocol.ts';

export const SEATS: Player[] = ['A', 'B'];

export interface Room {
  code: RoomCode;
  state: GameState;
  /** Which client OWNS each seat. Survives a dropped connection so the seat can be reclaimed;
   *  see `connected` for who is actually on the wire right now. */
  seats: Record<Player, ClientId | null>;
  /** Which seats have a live socket. Split from `seats` on purpose: a player who loses signal
   *  mid-hand still holds their seat and their cards, and the opponent sees "waiting for them
   *  to come back" rather than the seat silently opening up to a stranger who happens to know
   *  the code. */
  connected: Record<Player, boolean>;
}

export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): RoomResult<T> {
  return { ok: true, value };
}
function err<T>(error: string): RoomResult<T> {
  return { ok: false, error };
}

export function createRoom(
  code: RoomCode,
  seed: string,
  config: Config,
  dealer: Player = 'A',
): Room {
  return {
    code,
    state: newGame(seed, dealer, config),
    seats: { A: null, B: null },
    connected: { A: false, B: false },
  };
}

export function seatOf(room: Room, clientId: ClientId): Player | null {
  return SEATS.find((s) => room.seats[s] === clientId) ?? null;
}

export function bothSeated(room: Room): boolean {
  return SEATS.every((s) => room.seats[s] !== null);
}

/** Seats a client, or reseats one that is coming back.
 *
 *  Reclaiming is checked BEFORE looking for a free seat, so a reconnecting player always lands
 *  back in their own chair holding their own cards — never in the empty one, which would hand
 *  them their opponent's hand and, with it, the whole game. */
export function join(room: Room, clientId: ClientId): RoomResult<{ room: Room; seat: Player }> {
  const existing = seatOf(room, clientId);
  if (existing) {
    return ok({
      room: { ...room, connected: { ...room.connected, [existing]: true } },
      seat: existing,
    });
  }
  const free = SEATS.find((s) => room.seats[s] === null);
  if (!free) return err('That room already has two players.');
  return ok({
    room: {
      ...room,
      seats: { ...room.seats, [free]: clientId },
      connected: { ...room.connected, [free]: true },
    },
    seat: free,
  });
}

/** Marks a seat as off the wire. Deliberately does NOT free the seat — see `connected`. */
export function disconnect(room: Room, clientId: ClientId): Room {
  const seat = seatOf(room, clientId);
  if (!seat) return room;
  return { ...room, connected: { ...room.connected, [seat]: false } };
}

/** Applies an action on behalf of a client, authoritatively.
 *
 *  Authorisation and legality are the SAME question here, which is what makes this safe with no
 *  extra permission layer: `legalActions(state, seat)` returns `[]` for a player who is not on
 *  turn, so an action appearing in the sender's own legal list is by construction both a legal
 *  move and theirs to make. A client cannot play its opponent's card by sending the opponent's
 *  action, because that action is not in the sender's list.
 *
 *  This matters more than it looks: `PLAY_CARD` and `DEALER_DISCARD` carry no `player` field at
 *  all, so attribution CANNOT come from the message. It comes from which socket sent it. */
export function submit(
  room: Room,
  clientId: ClientId,
  action: Action,
): RoomResult<{ room: Room; completedTrick: CompletedTrick | null }> {
  const seat = seatOf(room, clientId);
  if (!seat) return err('You are not seated in this room.');
  if (!bothSeated(room)) return err('Waiting for another player.');

  const legal = legalActions(room.state, seat);
  if (!legal.some((a) => sameAction(a, action))) {
    return err('That move is not legal right now.');
  }

  const before = room.state;
  const after = reduce(before, action);
  return ok({
    room: { ...room, state: after },
    completedTrick: winningTrick(before, after, action),
  });
}

/** Rebuilds the trick that `reduce()` just swept away, so the server can hand it to both
 *  clients. Mirrors `useGame`'s local reconstruction and exists for the same reason — the
 *  winning card is never present in any committed state — but here it is the only way a remote
 *  player can ever see which card took the trick. */
function winningTrick(
  before: GameState,
  after: GameState,
  action: Action,
): CompletedTrick | null {
  if (action.type !== 'PLAY_CARD') return null;
  if (after.trickNumber <= before.trickNumber) return null;
  if (!before.trump) return null;
  const hand = actingHand(before);
  if (!hand) return null;

  const cards: TrickCard[] = [...before.currentTrick, { handId: hand, card: action.card }];
  return {
    cards,
    winner: after.tricksWon.A > before.tricksWon.A ? 'A' : 'B',
    winningIndex: trickWinnerIndex(cards, before.trump),
  };
}

/** True when the deal has settled and the room is waiting to be moved on to the next one.
 *
 *  Left as a question for the caller rather than done automatically, because the delay before
 *  the next deal is presentation, not rules: the server owns WHETHER the game advances, but
 *  the players need a beat to actually read the hand they just finished. */
export function needsDealAdvance(room: Room): boolean {
  return room.state.phase === 'hand_complete' || room.state.phase === 'misdeal';
}

export function advanceDeal(room: Room, seed: string): Room {
  if (!needsDealAdvance(room)) return room;
  return { ...room, state: nextDeal(room.state, seed) };
}

export function viewFor(room: Room, seat: Player): PlayerView {
  return redact(room.state, seat);
}

export function legalFor(room: Room, seat: Player): Action[] {
  // Nobody may start playing into a room that has no opponent in it yet.
  if (!bothSeated(room)) return [];
  return legalActions(room.state, seat);
}

export function opponentPresent(room: Room, seat: Player): boolean {
  const other: Player = seat === 'A' ? 'B' : 'A';
  return room.seats[other] !== null && room.connected[other];
}

/** Re-exported for callers that hold a Room and want the raw state (the server's deal-advance
 *  timer, tests). Kept as a function rather than reaching into `.state` at call sites so the
 *  Room shape stays free to change. */
export function stateOf(room: Room): GameState {
  return room.state;
}
