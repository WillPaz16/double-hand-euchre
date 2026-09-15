import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

/** Serves the built client from the SAME process as the WebSocket server.
 *
 *  One origin for the game and its socket is the point: it is what lets the client derive its
 *  own `wss://` URL from `location` instead of having one baked in at build time, and it is why
 *  `ALLOWED_ORIGINS` can stay unset in a normal deploy — there is only one origin to allow.
 *
 *  This lives in its own module rather than inline in `index.ts` for one reason: `index.ts`
 *  opens a listening socket at import, so nothing in it can be imported by a test. The path
 *  guard below is a trust boundary and should not rest on someone remembering to curl it.
 */

/** Only the types this bundle actually emits. A general-purpose mime database would be a
 *  dependency for a lookup table with nine rows in it. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolves a request path to an absolute path inside `root`, or null.
 *
 *  Two mechanisms, and it is worth being precise about which does what, because the obvious
 *  story is wrong. `normalize` does most of the work: on an ABSOLUTE path — which every
 *  `req.url` is — it collapses `..` and clamps at `/`, so `/../package.json` becomes
 *  `/package.json` and lands inside the root rather than above it. The explicit root check is
 *  the backstop for everything normalize does not cover, including a relative `root`, and it
 *  uses `root + sep` rather than a bare prefix test so a SIBLING directory whose name merely
 *  begins with the root's (`/app/dist-secrets` against `/app/dist`) cannot pass.
 *
 *  Decoding happens FIRST, deliberately: `%2e%2e%2f` is `../` by the time a filesystem sees it,
 *  so a guard placed before decoding is a guard that can be spelled around.
 *
 *  The property both together guarantee — result is null or inside root, for any input — is
 *  what tests/staticServer.test.ts asserts. */
export function resolveInClient(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    // A malformed percent-escape is not a path worth guessing at.
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = resolve(root);
  const full = resolve(join(base, normalize(decoded)));
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

function sendFile(res: ServerResponse, file: string, cache: string): void {
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': cache,
  });
  createReadStream(file).pipe(res);
}

/** Builds the request handler. `clientDir` is read ONCE, at startup — whether a built client
 *  exists is a property of the deployment, not of a request, and re-stat'ing it per request
 *  would be a filesystem call on the hot path to answer a question that cannot change. */
export function clientServer(clientDir: string): (req: IncomingMessage, res: ServerResponse) => void {
  const root = resolve(clientDir);
  const hasClient = existsSync(join(root, 'index.html'));

  return (req, res) => {
    if (!hasClient || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404);
      res.end();
      return;
    }

    // Query and hash are addressing, not path — and workbox appends `?__WB_REVISION__=...` to
    // every precached URL, so keeping the query here would 404 the entire precache manifest.
    const path = (req.url ?? '/').split(/[?#]/, 1)[0] ?? '/';
    const file = resolveInClient(root, path === '/' ? '/index.html' : path);

    if (file && existsSync(file) && statSync(file).isFile()) {
      // Vite fingerprints everything under /assets/, so those URLs can never change meaning and
      // are safe to cache forever. Everything else — index.html above all, but also sw.js and
      // the manifest — keeps a stable URL across deploys, so caching it is precisely how a
      // redeploy becomes invisible to someone who already has the page.
      const immutable = path.startsWith('/assets/');
      sendFile(res, file, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      return;
    }

    // SPA fallback. This app has no client-side router today, so in practice it only catches
    // typos — but it is what makes a deep link work the day one is added, and it costs a line.
    // A missing ASSET still 404s: a dotted extension that reached here is a file that should
    // have existed, and answering it with HTML turns a broken deploy into a silent one.
    if (!extname(path)) {
      sendFile(res, join(root, 'index.html'), 'no-cache');
      return;
    }
    res.writeHead(404);
    res.end();
  };
}
