import type { GameState } from '../../shared/engine/types.ts';

const KEY = 'euchre-saved-game';

/** Autosaved after every move (see useGame.ts) so closing the tab or hitting Quit never loses
 *  progress. `GameState` is plain strings/arrays/records — safe to round-trip through JSON as-is. */
export function loadSavedGame(): GameState | null {
  // The whole read is guarded, not just the parse. `localStorage.getItem` itself throws where a
  // browser blocks site data, and this runs inside useGame's state initialiser — unguarded, a
  // blocked-storage browser could not start a game at all.
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

/** Runs after every move. A full quota or blocked storage loses the autosave, not the game. */
export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Nothing useful to do mid-game; the in-memory game carries on.
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // If storage can't be written, there is no save to clear either.
  }
}
