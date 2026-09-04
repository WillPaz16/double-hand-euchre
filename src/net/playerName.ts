import { cleanName } from '../../shared/net/protocol.ts';
import { DEFAULT_AVATAR, toAvatarKey, type AvatarKey } from '../../shared/net/avatars.ts';

const KEY = 'euchre-player-name';

/** The name this player shows to their opponent, remembered between sessions so it only has to
 *  be typed once. Optional throughout: a player who never sets one is shown to the other side
 *  as "Opponent", which is a perfectly good way to play a card game with a friend who is
 *  already on the phone to you. */
export function getPlayerName(): string | null {
  try {
    return cleanName(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function setPlayerName(raw: string): void {
  const clean = cleanName(raw);
  try {
    if (clean) localStorage.setItem(KEY, clean);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode). The name still applies to this session via the
    // value the caller already holds; it just won't be remembered next time.
  }
}

const AVATAR_KEY = 'euchre-player-avatar';

/** The character this player shows their opponent, remembered like the name. Coerced on read as
 *  well as write: a key stored by an older build that no longer exists should quietly become the
 *  default rather than requesting an image that 404s. */
export function getPlayerAvatar(): AvatarKey {
  try {
    return toAvatarKey(localStorage.getItem(AVATAR_KEY));
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function setPlayerAvatar(key: AvatarKey): void {
  try {
    localStorage.setItem(AVATAR_KEY, key);
  } catch {
    // Storage unavailable; the choice still applies to this session.
  }
}
