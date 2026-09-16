import { describe, expect, it } from 'vitest';
import { roomCodeFromUrl, roomLink } from '../src/net/roomLink.ts';

describe('room links', () => {
  it('reads a code out of the query string, normalising case and spacing', () => {
    expect(roomCodeFromUrl('?room=TRUK')).toBe('TRUK');
    expect(roomCodeFromUrl('?room=truk')).toBe('TRUK');
    expect(roomCodeFromUrl('?room=%20truk%20')).toBe('TRUK');
    expect(roomCodeFromUrl('?foo=1&room=TRUK&bar=2')).toBe('TRUK');
  });

  it('refuses anything that is not a real code, so a bad link cannot mint a room', () => {
    for (const q of ['', '?room=', '?room=TOOLONG', '?room=AB', '?room=TR0K', '?room=TRIK!', '?nope=TRUK']) {
      expect(roomCodeFromUrl(q), q).toBeNull();
    }
    // 0/O and 1/I are excluded from the alphabet as ambiguous glyphs.
    expect(roomCodeFromUrl('?room=SMOK')).toBeNull();
  });

  it('builds an absolute link for the code', () => {
    expect(roomLink('TRUK', 'https://doublehand.willpaz16.workers.dev')).toBe(
      'https://doublehand.willpaz16.workers.dev/?room=TRUK',
    );
  });
});
