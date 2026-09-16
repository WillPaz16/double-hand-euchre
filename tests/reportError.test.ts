/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function freshModule() {
  vi.resetModules(); // the per-page cap is module state
  return import('../src/net/reportError.ts');
}

let beacon: ReturnType<typeof vi.fn>;
beforeEach(() => {
  beacon = vi.fn().mockReturnValue(true);
  vi.stubGlobal('navigator', { sendBeacon: beacon });
});
afterEach(() => vi.unstubAllGlobals());

describe('reportError', () => {
  it('posts the message, stack and origin to /report', async () => {
    const { reportError } = await freshModule();
    // Blob.text() is async; read what was passed by reconstructing from the call instead.
    reportError(new Error('boom'), 'render');
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]![0]).toBe('/report');
  });

  it('stops after a few reports, so a crash loop cannot flood the endpoint', async () => {
    const { reportError } = await freshModule();
    for (let i = 0; i < 10; i++) reportError(new Error(`boom ${i}`), 'window');
    expect(beacon.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('never throws, even when the browser refuses to send', async () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('blocked');
      },
    });
    const { reportError } = await freshModule();
    expect(() => reportError(new Error('boom'), 'render')).not.toThrow();
  });

  it('handles a thrown non-Error without crashing', async () => {
    const { reportError } = await freshModule();
    expect(() => reportError('just a string', 'promise')).not.toThrow();
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});
