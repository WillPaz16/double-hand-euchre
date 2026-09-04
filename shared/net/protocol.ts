import type { Action, CompletedTrick, Player, PlayerView } from '../engine/types.ts';

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
  | { t: 'hello'; code: RoomCode; clientId: ClientId; name?: string }
  | { t: 'action'; action: Action };

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
    }
  /** A refused `hello` or `action`, with a reason fit to show a player. The client stays
   *  connected; a rejected action simply did not happen. */
  | { t: 'rejected'; reason: string };

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
