import { cleanName } from '../../shared/net/protocol.ts';

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
