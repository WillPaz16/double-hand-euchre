import { normaliseRoomCode, type RoomCode } from '../../shared/net/protocol.ts';

const PARAM = 'room';

/** Reading a room out of the page URL, and putting one back.
 *
 *  Sharing a table used to mean reading four letters down the phone. A link carries the same four
 *  letters and opens straight into the table, which is the difference between "type this in" and
 *  "tap this". The code still has to survive `normaliseRoomCode`, so a typo, a stale link, or
 *  someone's creative guess lands on the title screen instead of minting a junk room.
 */
export function roomCodeFromUrl(search: string = window.location.search): RoomCode | null {
  try {
    return normaliseRoomCode(new URLSearchParams(search).get(PARAM) ?? '');
  } catch {
    // A malformed query string is not a room.
    return null;
  }
}

/** The link to share for a table. Absolute, because it is going into someone's messages. */
export function roomLink(code: RoomCode, origin: string = window.location.origin): string {
  return `${origin}/?${PARAM}=${encodeURIComponent(code)}`;
}

/** Keeps the address bar in step with the room, WITHOUT adding history entries: joining a table
 *  is not a page the browser's Back button should walk through, and the app has no router. Leaving
 *  passes null, which restores a clean URL so a later reload doesn't rejoin a room you left. */
export function setRoomInUrl(code: RoomCode | null): void {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set(PARAM, code);
    else url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  } catch {
    // History is unavailable in some embedded contexts; the room still works, it just isn't
    // reflected in the address bar.
  }
}
