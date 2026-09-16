import { normaliseRoomCode } from '../shared/net/protocol.ts';

export { RoomObject } from './room-object.ts';

/**
 * The edge entry point. Three jobs, and deliberately nothing else:
 *
 *   /health  — a liveness answer that is not a WebSocket upgrade.
 *   /ws      — route the socket to the ONE Durable Object that owns its room code.
 *   /report  — a crash report from a player's browser, written to this Worker's own logs.
 *   anything else — the built client, via the static-assets binding.
 *
 * The room code travels in the URL (`/ws?code=TRUK`) rather than only in `hello`, because
 * routing has to happen BEFORE the socket exists: the Worker must pick an object to hand the
 * upgrade to, and it cannot read a message that has not been sent yet. `hello` still carries
 * the code too, and the object refuses a mismatch — see `RoomObject.hello`.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    if (url.pathname === '/report') {
      return report(request, env);
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected a WebSocket upgrade.', { status: 426 });
      }
      if (!originAllowed(request.headers.get('Origin'), env.ALLOWED_ORIGINS)) {
        // 403 rather than a silent drop, so a misconfigured allowlist is diagnosable from the
        // client instead of looking like the server is down.
        return new Response('Origin not allowed.', { status: 403 });
      }
      // Validated HERE, before an object is ever addressed: `idFromName` would happily mint a
      // Durable Object for any string at all, so an unchecked code is a way to create objects.
      const code = normaliseRoomCode(url.searchParams.get('code') ?? '');
      if (!code) return new Response('Bad room code.', { status: 400 });

      // Checked AFTER the cheap rejections above and BEFORE addressing an object: waking a
      // Durable Object is the expensive part, and the point is to stop a flood of guessed codes
      // from doing that. Keyed per client IP.
      if (!(await underLimit(env.WS_LIMIT, clientIp(request)))) {
        return new Response('Too many connections. Try again in a minute.', { status: 429 });
      }

      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** The caller's address as Cloudflare sees it. Absent only when something else is in front of the
 *  Worker; those requests share one bucket rather than escaping the limit entirely. */
function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** True when the request may proceed. A missing binding (local `wrangler dev` without it, or a
 *  plan that does not offer it) means no limiting rather than no service. */
async function underLimit(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch {
    // A limiter that errors must not take the game down with it.
    return true;
  }
}

/** Crash reports from the browser (see src/net/reportError.ts).
 *
 *  Written to this Worker's logs, which `wrangler tail` streams and the dashboard keeps, because
 *  the alternative was hearing about bugs only when a player mentions them. Deliberately dumb: it
 *  stores nothing, answers 204 whatever happens, and the client never waits on it. Everything
 *  below is bounded — one small JSON body, four fields, all truncated — because this is an
 *  unauthenticated endpoint that writes to a log. */
const MAX_REPORT_BYTES = 4 * 1024;
const MAX_FIELD = 1000;

async function report(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!(await underLimit(env.REPORT_LIMIT, clientIp(request)))) {
    return new Response(null, { status: 429 });
  }
  const body = await request.text();
  if (body.length > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
  try {
    const raw = JSON.parse(body) as Record<string, unknown>;
    const field = (name: string) =>
      typeof raw[name] === 'string' ? (raw[name] as string).slice(0, MAX_FIELD) : undefined;
    console.error('client error report', {
      message: field('message'),
      stack: field('stack'),
      at: field('at'),
      build: field('build'),
      userAgent: request.headers.get('User-Agent')?.slice(0, MAX_FIELD),
    });
  } catch {
    // Unreadable body: nothing worth logging, and nothing worth failing over.
  }
  return new Response(null, { status: 204 });
}

/** Comma-separated allowlist. UNSET MEANS ALLOW ANY — and in the normal deploy it stays unset,
 *  because the client is served by this same Worker and there is only one origin to allow.
 *  Not CSRF protection (there are no credentials to steal); it only stops an unrelated page
 *  quietly opening sockets against this Worker. */
function originAllowed(origin: string | null, allowlist: string | undefined): boolean {
  const allowed = (allowlist ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return !!origin && allowed.includes(origin);
}
