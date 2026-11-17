/** Browser security headers for everything this Worker answers except a WebSocket upgrade.
 *
 *  The app is a static client plus one WebSocket, so the policy can be tight: scripts, styles,
 *  fonts, images, audio and the service worker all come from this origin, and nothing is allowed
 *  to frame the page. `style-src` keeps 'unsafe-inline' because React writes `style` attributes
 *  (the scoreboard's pip reveal does); scripts get no such allowance, which is the half that
 *  stops injected code from running. `font-src` allows `data:` because Vite inlines the small
 *  Silkscreen subsets into the CSS as base64; without it the pixel font silently falls back.
 *  `connect-src` names `wss:` explicitly because older Safari does not treat 'self' as covering
 *  a same-origin WebSocket. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' wss:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** Returns `response` with the headers added. A response carrying a WebSocket is returned as is:
 *  rebuilding it would drop the socket, and an upgrade has no document for a policy to govern. */
export function withSecurityHeaders(response: Response): Response {
  if ((response as Response & { webSocket?: unknown }).webSocket) return response;
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
}
