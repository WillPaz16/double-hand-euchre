import { describe, expect, it } from 'vitest';
import { resolve, sep } from 'node:path';
import { resolveInClient } from '../server/static.ts';

/** Serving the client puts a filesystem behind a public port, so which bytes a stranger can
 *  name is a trust boundary. This is asserted here rather than curled once by hand because a
 *  boundary that is only ever checked manually is one refactor away from being gone.
 *
 *  THE INVARIANT, stated as what it actually is: for any input at all, the result is either
 *  null or a path inside the root. Note that this is NOT the same as "traversal input returns
 *  null" — the first version of this test asserted that and was wrong. `normalize` clamps `..`
 *  at `/` for an absolute path, and every `req.url` is absolute, so `/../package.json`
 *  normalises to `/package.json` and lands harmlessly INSIDE the root; it 404s because no such
 *  file is there, not because it was rejected. The explicit root check is the backstop for the
 *  cases normalize does not cover, and the invariant below is what both mechanisms jointly
 *  guarantee. Asserting the mechanism instead of the property is how a test ends up passing
 *  while the thing it names stops being true. */
describe('resolveInClient', () => {
  const root = resolve('/srv/app/dist');
  const inside = (p: string | null) => p === root || (p !== null && p.startsWith(root + sep));

  const hostile = [
    '/../package.json',
    '/art/../../.env',
    '/../../../../etc/passwd',
    '/%2e%2e%2fpackage.json',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/..%2f..%2f.env',
    '/../dist-secrets/keys.json',
    '/....//....//etc/shadow',
    '//etc/passwd',
    '/./././../../root/.ssh/id_rsa',
    'http://evil.example/x',
  ];

  it('never escapes the root, whatever it is handed', () => {
    for (const path of hostile) {
      const got = resolveInClient(root, path);
      expect(inside(got), `${path} -> ${got}`).toBe(true);
    }
  });

  it('refuses a malformed escape and an embedded NUL rather than guessing', () => {
    expect(resolveInClient(root, '/%ZZ')).toBeNull();
    expect(resolveInClient(root, '/index.html%00.png')).toBeNull();
  });

  it('resolves ordinary paths to the file they name', () => {
    expect(resolveInClient(root, '/index.html')).toBe(resolve(root, 'index.html'));
    expect(resolveInClient(root, '/art/scene/chimney_tile.png'))
      .toBe(resolve(root, 'art/scene/chimney_tile.png'));
    expect(resolveInClient(root, '/')).toBe(root);
  });

  it('keeps a filename that merely CONTAINS dots', () => {
    // The guard must not be so eager it rejects real files: Vite emits hashed names and the
    // workbox runtime has dots in it.
    expect(resolveInClient(root, '/assets/index-CQhJV9qF.js'))
      .toBe(resolve(root, `assets${sep}index-CQhJV9qF.js`));
  });

  it('rejects a SIBLING directory that shares the root as a string prefix', () => {
    // The case a bare `startsWith(root)` gets wrong, and the reason the separator is in the
    // comparison. Reached only via a relative root, since an absolute request path cannot
    // climb — but the check is what makes that a fact about the input rather than luck.
    expect(resolveInClient('dist', '../dist-secrets/keys.json')).toBeNull();
  });
});
