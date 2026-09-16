/** Sends crash reports to the Worker, which logs them (see worker/index.ts `/report`).
 *
 *  Without this, a bug reaches the author only if a player mentions it. There is no third-party
 *  error service here and no account to pay for: the report lands in this Worker's own logs, which
 *  `wrangler tail` streams live and the Cloudflare dashboard retains.
 *
 *  Deliberately small and forgetful. It sends at most a few reports per page (a crash loop would
 *  otherwise report forever), never blocks or retries, and swallows its own failures — a broken
 *  reporter must not be a second bug on top of the first. It sends only what a stack trace already
 *  contains: no names, no chat, no game state. */
const MAX_PER_PAGE = 3;
let sent = 0;

/** Which build this came from — the hashed bundle name, so a report can be matched to a deploy. */
function buildId(): string {
  const src = [...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s));
  return src?.split('/').pop() ?? 'unknown';
}

export function reportError(error: unknown, at: string): void {
  if (sent >= MAX_PER_PAGE) return;
  sent += 1;
  try {
    const body = JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      at,
      build: buildId(),
    });
    // `sendBeacon` survives the page being closed, which is exactly when a crash report is at risk
    // of never being sent. `keepalive` fetch is the fallback where it is unavailable.
    if (!navigator.sendBeacon?.('/report', new Blob([body], { type: 'application/json' }))) {
      void fetch('/report', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting is best-effort by definition.
  }
}
