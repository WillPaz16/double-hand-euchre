import type { Action, CompletedTrick, Config, Player, PlayerView } from '../engine/types.ts';
import type { AvatarKey } from './avatars.ts';

/** A short human-shareable room code ("say it down the phone" length, not a UUID). */
export type RoomCode = string;

/** Stable per-browser identity, persisted client-side. NOT a security token — it identifies
 *  which seat a returning socket may reclaim after a drop, nothing more. Anyone who learns
 *  another player's clientId AND room code could steal their seat; that is an acceptable
 *  trade for a friendly two-player card game with shareable codes, and is the thing to
 *  replace first if this ever needs real accounts. */
export type ClientId = string;

export type ClientMessage =
  /** Join `code`, creating the room if it does not exist yet. Sending `hello` again with the
   *  same `clientId` after a dropped connection reclaims the same seat and resyncs — that is
   *  the whole reconnect story, and why the seat is keyed on `clientId` rather than on the
   *  socket. */
  | {
      t: 'hello';
      code: RoomCode;
      clientId: ClientId;
      name?: string;
      avatar?: string;
      /** This player's own blind-loner settings. Compared against the other player's when the
       *  second one sits down — see `RulesView`. Optional so an older client still joins. */
      rules?: LonerRules;
    }
  | { t: 'action'; action: Action }
  /** A line of chat. Cleaned and bounded server-side (`cleanChat`); never trusted as sent. */
  | { t: 'chat'; text: string }
  /** This player's pick while the two players' rule settings disagree. The table deals once
   *  both players' picks match. Ignored once rules are locked. */
  | { t: 'rules_vote'; rules: LonerRules }
  /** "Play again" once the game is over. Needs both players, like everything else at this
   *  table — one seat cannot restart a game somebody else is sitting in. */
  | { t: 'rematch' };

export type ServerMessage =
  /** Which seat you got. Sent once per successful `hello`, including on reconnect. */
  | { t: 'seated'; seat: Player; code: RoomCode }
  /** The authoritative state, already redacted for the recipient. `legal` is the server's own
   *  `legalActions` for that seat, so the client never has to derive playability itself and
   *  cannot disagree with the server about it. */
  /** `completedTrick` is non-null on exactly the sync that follows the card which took a
   *  trick. Without it a remote player never sees the winning card at all: the engine sweeps
   *  the trick in the same call that appends that card, so it is absent from every state the
   *  client receives. Sent rather than derived because the client provably cannot reconstruct
   *  it — see `CompletedTrick`'s own docstring. */
  | {
      t: 'sync';
      view: PlayerView;
      legal: Action[];
      opponentPresent: boolean;
      completedTrick: CompletedTrick | null;
      /** What to call the other player, or null if they haven't given a name. Sent rather than
       *  stored client-side because it belongs to THEM: it arrives when they join and changes
       *  when they rejoin under a different one. */
      opponentName: string | null;
      /** Which character to draw across the table. Always a valid key — the server coerces
       *  anything it doesn't recognise, so a client can never make the other player's board
       *  point at an image that doesn't exist. */
      opponentAvatar: AvatarKey;
      /** Which rules this table plays by, and — until they are settled — what each player
       *  wants. Sent on every sync because it is part of the table, like the score. */
      rules: RulesView;
      /** Where a "play again" stands: whether you have asked for one, and whether they have.
       *  Part of the table's state like the score, so it rides the sync both players already
       *  get rather than needing a message of its own — and a reconnect mid-offer therefore
       *  restores the offer instead of losing it. */
      rematch: RematchView;
    }
  /** One new chat line, sent to both seats as it happens. */
  | { t: 'chat'; message: ChatMessage }
  /** The room's saved chat, sent once to a socket as it is seated — so a reconnect, a reload,
   *  or the other tab you just closed does not wipe the conversation. */
  | { t: 'chat_history'; messages: ChatMessage[] }
  /** Sent to a player whose mid-game rule proposal the other player turned down. */
  | { t: 'rules_declined' }
  /** A refused `hello` or `action`, with a reason fit to show a player. The client stays
   *  connected; a rejected action simply did not happen. */
  | { t: 'rejected'; reason: string };

/** The two configurable blind-loner tiers. The same shape as `Config['lonerTiersEnabled']`
 *  and as the Settings screen's saved toggles, because it IS that field. */
export type LonerRules = Config['lonerTiersEnabled'];
export const LONER_RULE_KEYS = ['blind_hand', 'full_blind'] as const;

/** Coerces untrusted input to rules, or null. Every key must be a real boolean: a client that
 *  sends `{ full_blind: "yes" }` is not expressing a preference this server can act on. */
export function toLonerRules(raw: unknown): LonerRules | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!LONER_RULE_KEYS.every((k) => typeof r[k] === 'boolean')) return null;
  return { blind_hand: r.blind_hand as boolean, full_blind: r.full_blind as boolean };
}

export function sameRules(a: LonerRules, b: LonerRules): boolean {
  return LONER_RULE_KEYS.every((k) => a[k] === b[k]);
}

/** What one seat sees about the table's rules.
 *
 *  `locked` is the only thing that gates play. Until it is true nobody has a legal move, and
 *  the client shows the agreement prompt using the rest: `mine`/`theirs` are each player's own
 *  settings as they sat down, and `myVote`/`theirVote` are their picks since (null = not picked
 *  yet). Once locked, `inEffect` is the table's rules for the rest of the game. */
export interface RulesView {
  locked: boolean;
  inEffect: LonerRules;
  mine: LonerRules | null;
  theirs: LonerRules | null;
  myVote: LonerRules | null;
  theirVote: LonerRules | null;
  /** A change both players agreed to mid-game, applied when the next hand is dealt. */
  next: LonerRules | null;
}

/** Where a rematch offer stands, from one seat's point of view. Two booleans rather than a
 *  single "pending" flag because the screen says something different in each case: you are
 *  waiting on them, or they are waiting on you. */
export interface RematchView {
  mine: boolean;
  theirs: boolean;
}

export interface ChatMessage {
  /** Increasing per room. React keys and "which bubble is new" both use it. */
  id: number;
  from: Player;
  text: string;
}

export const MAX_CHAT_LENGTH = 200;
/** How much conversation a room keeps. Enough to scroll back through a game; small enough that
 *  the room's stored state stays tiny. */
export const MAX_CHAT_HISTORY = 50;

/** Chat is shown on someone ELSE's screen, so it is bounded and trimmed once, here, where both
 *  client and server call the same function. React escapes text, so the risk is a wall of text
 *  breaking the layout rather than injection. Line breaks collapse to spaces: a speech bubble
 *  has no room for a paragraph. */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/** Rooms are addressed by a code a person can read aloud. Ambiguous glyphs (0/O, 1/I) are
 *  excluded so "was that a zero or an oh" never costs someone a game. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

export function makeRoomCode(random: () => number = Math.random): RoomCode {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Normalises user-typed input ("  a1b2 " -> "A1B2") before lookup, so a room is found
 *  regardless of how the code was typed. Returns null if it could not be a valid code. */
export function normaliseRoomCode(input: string): RoomCode | null {
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length !== ROOM_CODE_LENGTH) return null;
  if (![...trimmed].every((c) => CODE_ALPHABET.includes(c))) return null;
  return trimmed;
}

/** WebSocket close code for "this seat was taken over by another connection from the SAME
 *  player" — a second tab, or the same game reopened on another device.
 *
 *  It needs its own code because the replaced client must NOT reconnect. A plain close looks
 *  like a dropped network, and the client's correct response to a drop is to reconnect and
 *  reclaim its seat — which replaces the OTHER connection, which reconnects and replaces this
 *  one. Reproduced on the live deploy with two tabs of one browser: both seated as A and evicted
 *  each other every ~0.7s indefinitely, each showing "Lost the connection" while waiting for an
 *  opponent who was really themselves. The newest connection wins; the older one stops.
 *  4000-4999 is the range the WebSocket spec reserves for applications. */
export const CLOSE_REPLACED = 4001;

/** Display names are shown to the other player, so they are bounded and trimmed here — once,
 *  where both the client and the server can call the same function, rather than trusted from
 *  whatever a client happens to send. React escapes text nodes, so the risk is nuisance
 *  (a wall of characters breaking the scoreboard) rather than injection.
 *  Returns null for anything that is empty after trimming, which the UI reads as "no name". */
export const MAX_NAME_LENGTH = 16;

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}
