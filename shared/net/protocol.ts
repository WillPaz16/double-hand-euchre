import type { Action, Player, PlayerView } from '../engine/types.ts';

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
  | { t: 'hello'; code: RoomCode; clientId: ClientId }
  | { t: 'action'; action: Action };

export type ServerMessage =
  /** Which seat you got. Sent once per successful `hello`, including on reconnect. */
  | { t: 'seated'; seat: Player; code: RoomCode }
  /** The authoritative state, already redacted for the recipient. `legal` is the server's own
   *  `legalActions` for that seat, so the client never has to derive playability itself and
   *  cannot disagree with the server about it. */
  | { t: 'sync'; view: PlayerView; legal: Action[]; opponentPresent: boolean }
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
