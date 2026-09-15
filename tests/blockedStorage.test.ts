import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSavedGame, loadSavedGame, saveGame } from '../src/game/savedGame.ts';
import { getRuleSettings, setRuleSettings } from '../src/game/ruleSettings.ts';
import { isMuted, setMuted } from '../src/game/audioSettings.ts';
import { DEFAULT_CONFIG, newGame } from '../shared/engine/index.ts';

/** Browsers set to block site data (and some private modes) make every localStorage call THROW
 *  a SecurityError rather than return null, and a full quota throws on write. Every settings
 *  module must degrade to defaults instead of taking the page down. */
function throwingStorage(): Storage {
  const deny = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return { length: 0, clear: deny, getItem: deny, key: deny, removeItem: deny, setItem: deny };
}

afterEach(() => vi.unstubAllGlobals());

describe('settings survive storage that throws', () => {
  it('saved game: load returns null; save and clear are no-ops', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(loadSavedGame()).toBeNull();
    expect(() => saveGame(newGame('s', 'A', DEFAULT_CONFIG))).not.toThrow();
    expect(() => clearSavedGame()).not.toThrow();
  });

  it('rule settings fall back to defaults; writing does not throw', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(getRuleSettings()).toEqual(DEFAULT_CONFIG.lonerTiersEnabled);
    expect(() => setRuleSettings({ blind_hand: true, full_blind: true })).not.toThrow();
  });

  it('audio: unmuted by default; writing does not throw', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(isMuted()).toBe(false);
    expect(() => setMuted(true)).not.toThrow();
  });
});
