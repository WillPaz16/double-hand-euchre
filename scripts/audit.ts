/**
 * Runs scripts/scale-audit.js headlessly, at every standard viewport, in CI.
 *
 * The audit script itself has run "by pasting into a browser console" since Phase 2f — the
 * verification instructions in every phase's plan said so explicitly. That was fine for a
 * check run by hand at the end of a change, and it is exactly how 2g.4's collision regression
 * shipped: verified once, at one viewport, with a snippet that lived nowhere and was never run
 * again. This script is the fix for THAT, not just for the specific bug — an audit that only
 * runs when someone remembers to paste it into a console is not a check, it's a suggestion.
 *
 * Drives the real dev server (not a static build) with Playwright/Chromium, because the audit
 * needs the game in a real mid-hand state — chrome collisions specifically only show up once
 * the scoreboard, banner, opponent and hand tray are all actually on screen, which the title
 * screen alone doesn't exercise.
 */
import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';

const AUDIT_SRC = readFileSync(new URL('./scale-audit.js', import.meta.url), 'utf8');
const PORT = 5183; // not 5173 — avoid colliding with a dev server the user already has open
const BASE_URL = `http://localhost:${PORT}`;

// The same four viewports every phase since 2f.2 has verified at by hand: two phone
// orientations at the exact sizes named in the architecture doc's own responsive checklist
// (§7), plus the --px breakpoint boundary (1010, just above the 900px step) and a
// comfortably-desktop size (1400) — the range this project's regressions have actually
// clustered at (2f.2's leg clipping, 2g.4's collisions).
const VIEWPORTS = [
  { width: 375, height: 812, label: 'portrait phone' },
  { width: 812, height: 375, label: 'landscape phone' },
  { width: 1010, height: 900, label: 'px-breakpoint boundary' },
  { width: 1400, height: 900, label: 'desktop' },
];

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) reject(new Error(`dev server never came up at ${url}`));
          else setTimeout(tryOnce, 300);
        });
    };
    tryOnce();
  });
}

// Drives the game to a mid-hand bidding state, the same sequence every manual check in this
// project's history has used: Play -> pick a packet -> pass until something is legal to click
// (order-up windows come and go across a few bidding phases, so "pass" isn't always present).
async function driveToBiddingState(page: import('@playwright/test').Page): Promise<void> {
  const clickIfPresent = async (re: RegExp): Promise<boolean> => {
    const btn = page.getByRole('button', { name: re });
    if ((await btn.count()) === 0) return false;
    await btn.first().click();
    return true;
  };
  await clickIfPresent(/^play$/i);
  await page.waitForTimeout(400);
  await clickIfPresent(/pick packet 1/i);
  await page.waitForTimeout(400);
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(350);
    const acted =
      (await clickIfPresent(/^pass$/i)) ||
      (await clickIfPresent(/order it up|^call /i)) ||
      (await clickIfPresent(/with partner/i));
    if (!acted) break;
  }
  await page.waitForTimeout(600);
}

async function main(): Promise<void> {
  const server: ChildProcess = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' },
  );
  let failed = false;

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch();
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(BASE_URL);
        await driveToBiddingState(page);

        const result = await page.evaluate(AUDIT_SRC);
        const de = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
        }));
        const noScroll = de.scrollHeight === de.clientHeight;

        const ok = (result as { ok: boolean }).ok && noScroll;
        const label = `${vp.width}x${vp.height} (${vp.label})`;
        if (ok) {
          console.log(`  OK    ${label}`);
        } else {
          failed = true;
          console.error(`  FAIL  ${label}`);
          console.error(JSON.stringify({ ...(result as object), noScroll }, null, 2));
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }

  if (failed) {
    console.error('\naudit failed — see above');
    process.exit(1);
  }
  console.log('\naudit clean at all viewports');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
