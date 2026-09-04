import type { ClientId } from '../../shared/net/protocol.ts';

const KEY = 'euchre-client-id';

/** In-memory fallback for when storage is unavailable (private mode, blocked cookies). The
 *  game still works; you just lose the ability to reclaim a seat across a reload. */
let memoryFallback: ClientId | null = null;

function mint(): ClientId {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `c-${rand}`;
}

/** A stable per-browser id, created once and reused forever.
 *
 *  This is what makes reconnect mean anything: the server keys a seat on the clientId, not on
 *  the socket, so a dropped phone that comes back with the same id is put back in its own chair
 *  holding its own cards. Per browser rather than per tab on purpose — two tabs on one machine
 *  are the same player, and the server treats a second connection for the same id as replacing
 *  the first rather than as a new opponent.
 *
 *  Explicitly not a credential; see `ClientId`'s own note in protocol.ts. Anyone who learns both
 *  this and a room code could take that seat. That is the right trade for a game you join by
 *  reading four letters to a friend, and the first thing to replace if real accounts arrive. */
export function getClientId(): ClientId {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = mint();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    memoryFallback ??= mint();
    return memoryFallback;
  }
}
