import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { AVATAR_KEYS, AVATAR_EXPRESSIONS, AVATAR_LABELS, toAvatarKey, avatarSrc } from '../shared/net/avatars.ts';

/** Guards the one seam the type system cannot: the character roster lives in BOTH
 *  `art/generate_art.py` (which draws them) and `shared/net/avatars.ts` (which names them), and
 *  nothing links the two. Adding a character to one side only would ship an <img> pointing at a
 *  file that was never generated — a broken portrait in the middle of the table, discovered by
 *  a player rather than by CI. */
describe('avatar art matches the declared roster', () => {
  it('has all four expression sprites on disk for every key', () => {
    const missing: string[] = [];
    for (const key of AVATAR_KEYS) {
      for (const expression of AVATAR_EXPRESSIONS) {
        const path = `public${avatarSrc(key, expression)}`;
        if (!existsSync(path)) missing.push(path);
      }
    }
    expect(missing).toEqual([]);
  });

  it('labels every key', () => {
    for (const key of AVATAR_KEYS) {
      expect(AVATAR_LABELS[key]).toBeTruthy();
    }
  });
});

describe('avatar key parsing', () => {
  it('accepts a known key and falls back on anything else', () => {
    expect(toAvatarKey('card_sharp')).toBe('card_sharp');
    // An older client, a typo, or someone editing the socket by hand: costs a costume, not a game.
    expect(toAvatarKey('sasquatch')).toBe('old_timer');
    expect(toAvatarKey(undefined)).toBe('old_timer');
    expect(toAvatarKey(42)).toBe('old_timer');
  });
});
