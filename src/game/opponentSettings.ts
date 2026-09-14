import { DEFAULT_AVATAR, toAvatarKey, type AvatarKey } from '../../shared/net/avatars.ts';

const KEY = 'euchre-solo-opponent';

/** Which character you play AGAINST in single-player.
 *
 *  Separate from `playerName.ts`'s `euchre-player-avatar`, which is the character you show an
 *  online opponent. They are genuinely different choices — who you are, and who you want to
 *  sit across from — and sharing one key would mean picking a face online silently changed
 *  your solo opponent. */
export function getSoloOpponent(): AvatarKey {
  try {
    return toAvatarKey(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function setSoloOpponent(key: AvatarKey): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // Storage unavailable; the choice still applies for this session.
  }
}
