import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  withSecurityHeaders,
} from '../worker/security-headers.ts';

describe('withSecurityHeaders', () => {
  it('adds every header and leaves status and body alone', async () => {
    const out = withSecurityHeaders(new Response('hello', { status: 200 }));
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(out.headers.get(name)).toBe(value);
    }
    expect(out.status).toBe(200);
    expect(await out.text()).toBe('hello');
  });

  it('keeps headers the route already set', () => {
    const out = withSecurityHeaders(new Response('x', { headers: { 'Content-Type': 'text/html' } }));
    expect(out.headers.get('Content-Type')).toBe('text/html');
  });

  it('keeps an error status', () => {
    expect(withSecurityHeaders(new Response(null, { status: 429 })).status).toBe(429);
  });

  it('hands a WebSocket upgrade back untouched', () => {
    const upgrade = Object.assign(new Response(null, { status: 200 }), { webSocket: {} });
    expect(withSecurityHeaders(upgrade)).toBe(upgrade);
  });
});

describe('the policy', () => {
  it('lets no script run except from this origin, and nothing frame the page', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/);
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });
});

describe('public/_headers', () => {
  // Static assets never reach the Worker, so this file is the only thing that puts headers on
  // the HTML. It has to say exactly what the Worker says on its own responses.
  it('matches the Worker headers', () => {
    const text = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
    const lines = text.split('\n').filter((l) => /^\s+\S/.test(l));
    const parsed = Object.fromEntries(
      lines.map((l) => {
        const at = l.indexOf(':');
        return [l.slice(0, at).trim(), l.slice(at + 1).trim()];
      }),
    );
    expect(parsed).toEqual(SECURITY_HEADERS);
  });
});
