/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/ui/Game.tsx';

const SAVE_KEY = 'euchre-saved-game';

/** Node 26 ships its own global `localStorage` (undefined without --localstorage-file), and it
 *  shadows jsdom's — so a plain in-memory Storage is stubbed rather than relying on either. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});
afterEach(cleanup);

/** Direct user feedback: "when you quit to title, it doesnt save the game you are playing."
 *  Quit called a `quit()` that deleted the autosave, so the title screen stopped offering
 *  Continue. The contract is PauseMenu's own: Quit means "stop showing me this game", not
 *  "discard progress". */
describe('Quit to Title', () => {
  it('leaves the in-progress game saved so Continue can resume it', () => {
    const onQuit = vi.fn();
    render(<Game onQuit={onQuit} />);
    const saved = localStorage.getItem(SAVE_KEY);
    expect(saved).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Pause menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quit to Title' }));

    expect(onQuit).toHaveBeenCalledOnce();
    expect(localStorage.getItem(SAVE_KEY)).toBe(saved);
  });
});
