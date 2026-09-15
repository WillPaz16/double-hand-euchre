import { normaliseRoomCode } from '../shared/net/protocol.ts';

export { RoomObject } from './room-object.ts';

/**
 * The edge entry point. Three jobs, and deliberately nothing else:
 *
 *   /health  — a liveness answer that is not a WebSocket upgrade.
 *   /ws      — route the socket to the ONE Durable Object that owns its room code.
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

      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** Comma-separated allowlist. UNSET MEANS ALLOW ANY — and in the normal deploy it stays unset,
 *  because the client is served by this same Worker and there is only one origin to allow.
 *  Not CSRF protection (there are no credentials to steal); it only stops an unrelated page
 *  quietly opening sockets against this Worker. */
function originAllowed(origin: string | null, allowlist: string | undefined): boolean {
  const allowed = (allowlist ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return !!origin && allowed.includes(origin);
}
