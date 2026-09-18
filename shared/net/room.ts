import {
  DEFAULT_CONFIG,
  actingHand,
  legalActions,
  newGame,
  nextDeal,
  otherPlayer,
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
import {
  MAX_CHAT_HISTORY,
  cleanChat,
  sameRules,
  type ChatMessage,
  type ClientId,
  type LonerRules,
  type RoomCode,
  type RematchView,
  type RulesView,
} from './protocol.ts';
import { DEFAULT_AVATAR, type AvatarKey } from './avatars.ts';

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
  /** Display name per seat, null until that player supplies one. */
  names: Record<Player, string | null>;
  /** Chosen character per seat. */
  avatars: Record<Player, AvatarKey>;
  /** Each player's own blind-loner settings, as they sat down. */
  proposed: Record<Player, LonerRules | null>;
  /** Each player's current pick. Before the rules lock, this is how the two settle a clash;
   *  after, it is how either proposes a change for the next hand. Cleared whenever they agree. */
  votes: Record<Player, LonerRules | null>;
  /** Rules both players agreed to mid-game, waiting for the next deal. Direct user feedback:
   *  blind loners "can be switched on at any time during a game for the next round (so after a
   *  scoring event)" — never mid-hand, where changing which loner tiers exist would change the
   *  meaning of a bid already made. */
  pendingRules: LonerRules | null;
  /** False until both players are seated and agree on rules. NOTHING is playable until then —
   *  see `legalFor` — which is what makes it safe to change the game's config at the moment of
   *  locking: no card has been touched. */
  rulesLocked: boolean;
  /** The room's conversation, newest last, capped at MAX_CHAT_HISTORY. Stored with the room so
   *  it survives reconnects and restarts along with the game it belongs to. */
  chat: ChatMessage[];
  /** Who has asked to play again once the game is over. Cleared the moment a rematch starts,
   *  and stored with the room so an offer survives the asker reconnecting. */
  rematch: Record<Player, boolean>;
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
    names: { A: null, B: null },
    avatars: { A: DEFAULT_AVATAR, B: DEFAULT_AVATAR },
    proposed: { A: null, B: null },
    votes: { A: null, B: null },
    pendingRules: null,
    rulesLocked: false,
    chat: [],
    rematch: { A: false, B: false },
  };
}

/** Fills in fields added after a room may already have been stored. A stored room predating
 *  rule agreement could be mid-hand, so it counts as already agreed on the rules it was dealt
 *  with — reopening that question in the middle of a game would freeze it. */
export function normaliseRoom(room: Room): Room {
  return {
    ...room,
    proposed: room.proposed ?? { A: null, B: null },
    votes: room.votes ?? { A: null, B: null },
    pendingRules: room.pendingRules ?? null,
    rulesLocked: room.rulesLocked ?? true,
    chat: room.chat ?? [],
    rematch: room.rematch ?? { A: false, B: false },
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
export function join(
  room: Room,
  clientId: ClientId,
  name: string | null = null,
  avatar: AvatarKey = DEFAULT_AVATAR,
  rules: LonerRules | null = null,
): RoomResult<{ room: Room; seat: Player }> {
  const existing = seatOf(room, clientId);
  if (existing) {
    return ok({
      room: settleRules({
        ...room,
        connected: { ...room.connected, [existing]: true },
        // A returning player may have changed their name; keep the old one if they sent none.
        names: { ...room.names, [existing]: name ?? room.names[existing] },
        avatars: { ...room.avatars, [existing]: avatar },
        // Settings can still change before the rules lock (a player who flips a toggle and
        // rejoins); after that the table's rules are fixed for the whole game.
        proposed:
          rules && !room.rulesLocked ? { ...room.proposed, [existing]: rules } : room.proposed,
      }),
      seat: existing,
    });
  }
  const free = SEATS.find((s) => room.seats[s] === null);
  if (!free) return err('That room already has two players.');
  return ok({
    room: settleRules({
      ...room,
      seats: { ...room.seats, [free]: clientId },
      connected: { ...room.connected, [free]: true },
      names: { ...room.names, [free]: name },
      avatars: { ...room.avatars, [free]: avatar },
      proposed: { ...room.proposed, [free]: rules },
    }),
    seat: free,
  });
}

/** Locks the table's rules if the players agree — by their settings, or by their votes.
 *
 *  Direct user decision: when the two players' settings DIFFER, both are asked to agree rather
 *  than one side's settings silently winning. When they already match, nothing is asked and
 *  nothing changes — the table simply plays by the rules both chose. A player with no stated
 *  settings (an older client) counts as the defaults. */
function settleRules(room: Room): Room {
  if (!bothSeated(room)) return room;
  const { A, B } = room.votes;
  const agreed = A && B && sameRules(A, B) ? A : null;

  if (!room.rulesLocked) {
    // Until a player picks, their own settings ARE their pick. So agreeing takes one click:
    // switch to what the other player already has, and the table deals — nobody has to
    // re-press a choice that was already showing as theirs.
    const a = room.votes.A ?? room.proposed.A ?? DEFAULT_CONFIG.lonerTiersEnabled;
    const b = room.votes.B ?? room.proposed.B ?? DEFAULT_CONFIG.lonerTiersEnabled;
    return sameRules(a, b) ? lockRules(room, a) : room;
  }

  // Mid-game: an agreement becomes the rules for the next deal. Agreeing on what is ALREADY in
  // effect is how a pending change gets cancelled, so it clears `pendingRules` rather than
  // queueing a no-op.
  if (!agreed) return room;
  const current = room.state.config.lonerTiersEnabled;
  return {
    ...room,
    votes: { A: null, B: null },
    pendingRules: sameRules(agreed, current) ? null : agreed,
  };
}

/** The rules the NEXT deal will use if nothing else changes — what a mid-game proposal is a
 *  proposal to change, and what "keep the current rules" means. */
export function nextRules(room: Room): LonerRules {
  return room.pendingRules ?? room.state.config.lonerTiersEnabled;
}

/** Fixes the rules and writes them into the game's config. Safe precisely because nothing has
 *  been played: `legalFor` offers no moves until this has run, and the deal itself depends only
 *  on the seed — so this is the same game `newGame` would have dealt with these rules. The
 *  config then carries forward to every later deal through `nextDeal`. */
function lockRules(room: Room, rules: LonerRules): Room {
  return {
    ...room,
    rulesLocked: true,
    votes: { A: null, B: null },
    state: { ...room.state, config: { ...room.state.config, lonerTiersEnabled: rules } },
  };
}

/** Records a player's pick.
 *
 *  Before the rules lock, both players pick until their picks match.
 *
 *  After, a pick that differs from `nextRules` is a PROPOSAL, and a pick equal to it is an
 *  ANSWER of "keep things as they are". Two consequences keep this from getting stuck:
 *    - a new proposal clears the other player's old pick, so an earlier "keep" can never
 *      silently count as a refusal of something they have not seen yet;
 *    - a "keep" while the other player is proposing something drops the proposal outright,
 *      rather than leaving two different picks sitting there waiting forever. */
export function voteRules(room: Room, clientId: ClientId, rules: LonerRules): RoomResult<Room> {
  const seat = seatOf(room, clientId);
  if (!seat) return err('You are not seated in this room.');
  if (!bothSeated(room)) return err('Waiting for another player.');
  const other: Player = seat === 'A' ? 'B' : 'A';

  if (!room.rulesLocked) {
    return ok(settleRules({ ...room, votes: { ...room.votes, [seat]: rules } }));
  }

  const keep = sameRules(rules, nextRules(room));
  const theirs = room.votes[other];
  if (keep && theirs && !sameRules(theirs, nextRules(room))) {
    return ok({ ...room, votes: { A: null, B: null } });
  }
  if (keep) return ok({ ...room, votes: { ...room.votes, [seat]: null } });

  const votes = { ...room.votes, [seat]: rules } as Record<Player, LonerRules | null>;
  if (theirs && !sameRules(theirs, rules)) votes[other] = null;
  return ok(settleRules({ ...room, votes }));
}

/** True when this vote turns DOWN the other player's standing proposal — as opposed to
 *  withdrawing your own, or agreeing. The server uses it to tell the proposer, because from
 *  their side all three look the same: their proposal simply disappears. */
export function isDecline(room: Room, clientId: ClientId, rules: LonerRules): boolean {
  const seat = seatOf(room, clientId);
  if (!seat || !room.rulesLocked) return false;
  const theirs = room.votes[seat === 'A' ? 'B' : 'A'];
  const next = nextRules(room);
  return !!theirs && !sameRules(theirs, next) && sameRules(rules, next);
}

export function rulesViewFor(room: Room, seat: Player): RulesView {
  const other: Player = seat === 'A' ? 'B' : 'A';
  return {
    locked: room.rulesLocked,
    inEffect: room.state.config.lonerTiersEnabled,
    mine: room.proposed[seat],
    theirs: room.proposed[other],
    myVote: room.votes[seat],
    theirVote: room.votes[other],
    next: room.pendingRules,
  };
}

export function rematchViewFor(room: Room, seat: Player): RematchView {
  const other: Player = seat === 'A' ? 'B' : 'A';
  return { mine: room.rematch[seat], theirs: room.rematch[other] };
}

/** Asks to play again, and starts a fresh game once BOTH seats have asked.
 *
 *  Direct user feedback: "the play again button doesnt work in multiplayer." It never could —
 *  `OnlineGame` passed the button a no-op handler, because a unilateral restart is exactly the
 *  thing a two-player table cannot have: one player cannot wipe a finished game out from under
 *  the other before they have looked at the final score. So it works the way every other shared
 *  decision at this table works — both players ask, and the game restarts when they agree.
 *
 *  A fresh `newGame` rather than `nextDeal`: this is a new game to 10, so the score starts over.
 *  The agreed rules carry across, since they are the table's, not the game's — the players
 *  settled them once and should not have to negotiate again to play a second game. The deal
 *  passes to the other player, the way it would if the last hand had simply continued. */
export function requestRematch(room: Room, clientId: ClientId, seed: string): RoomResult<Room> {
  const seat = seatOf(room, clientId);
  if (!seat) return err('You are not seated in this room.');
  if (room.state.phase !== 'game_over') return err('The game is not over yet.');

  const rematch = { ...room.rematch, [seat]: true };
  if (!SEATS.every((s) => rematch[s])) return ok({ ...room, rematch });

  return ok({
    ...room,
    state: newGame(seed, otherPlayer(room.state.dealer), room.state.config),
    rematch: { A: false, B: false },
    votes: { A: null, B: null },
    pendingRules: null,
  });
}

/** Adds a chat line from a seated player. The text is cleaned here rather than trusted: it is
 *  shown on the other player's screen. */
export function postChat(
  room: Room,
  clientId: ClientId,
  raw: unknown,
): RoomResult<{ room: Room; message: ChatMessage }> {
  const seat = seatOf(room, clientId);
  if (!seat) return err('You are not seated in this room.');
  const text = cleanChat(raw);
  if (!text) return err('That message is empty.');
  const message: ChatMessage = { id: (room.chat.at(-1)?.id ?? 0) + 1, from: seat, text };
  return ok({ room: { ...room, chat: [...room.chat, message].slice(-MAX_CHAT_HISTORY) }, message });
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
  if (!room.rulesLocked) return err('Agree on the rules first.');

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
  // A rules change agreed mid-game lands HERE, between hands, and nowhere else.
  const state = room.pendingRules
    ? { ...room.state, config: { ...room.state.config, lonerTiersEnabled: room.pendingRules } }
    : room.state;
  return { ...room, state: nextDeal(state, seed), pendingRules: null };
}

export function viewFor(room: Room, seat: Player): PlayerView {
  return redact(room.state, seat);
}

export function legalFor(room: Room, seat: Player): Action[] {
  // Nobody may start playing into a room that has no opponent in it yet, or before the two
  // players have agreed which rules the table plays by.
  if (!bothSeated(room) || !room.rulesLocked) return [];
  return legalActions(room.state, seat);
}

export function opponentPresent(room: Room, seat: Player): boolean {
  const other: Player = seat === 'A' ? 'B' : 'A';
  return room.seats[other] !== null && room.connected[other];
}

export function opponentName(room: Room, seat: Player): string | null {
  const other: Player = seat === 'A' ? 'B' : 'A';
  return room.names[other];
}

export function opponentAvatar(room: Room, seat: Player): AvatarKey {
  const other: Player = seat === 'A' ? 'B' : 'A';
  return room.avatars[other];
}

/** Re-exported for callers that hold a Room and want the raw state (the server's deal-advance
 *  timer, tests). Kept as a function rather than reaching into `.state` at call sites so the
 *  Room shape stays free to change. */
export function stateOf(room: Room): GameState {
  return room.state;
}
