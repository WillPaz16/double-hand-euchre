import type { GameState } from '../../shared/engine/types.ts';

const KEY = 'euchre-saved-game';

/** Autosaved after every move (see useGame.ts) so closing the tab or hitting Quit never loses
 *  progress. `GameState` is plain strings/arrays/records — safe to round-trip through JSON as-is. */
export function loadSavedGame(): GameState | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearSavedGame(): void {
  localStorage.removeItem(KEY);
}
