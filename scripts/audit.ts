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
/** Mirrors `--frame-cap` in index.css. Above this width `.game-root` stops growing and the
 *  whole composition — scenery included — must hold still relative to it. */
const FRAME_CAP = 1440;
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
  // Past the 1440px cap on `.game-root`. Every viewport above stops at 1400, which is exactly
  // why the unbounded-stretch bug survived: the game had no max-width at all, and the pause
  // gear's percentage placement drifted further right the wider the window got, but nothing
  // here ever looked above 1400 to notice. This one sits beyond the cap so it exercises the
  // capped-and-centred path specifically, not just a wider version of the uncapped one.
  { width: 1800, height: 1000, label: 'ultra-wide desktop' },
  // Narrower than every phone above (375+) and tall enough to engage `.table-frame-roomy`
  // (needs `min-height: 700px`) — direct user feedback ("i cant see my cards anymore on
  // screen") traced to `.table-frame-roomy` (320px wide) exceeding viewports narrower than
  // itself, which none of the phone-width viewports above are narrow enough to exercise.
  // 300, not 320, so there's a real 20px margin rather than sitting exactly on the boundary.
  { width: 300, height: 750, label: 'narrow phone, roomy table active' },
  // TWO viewports past `--frame-cap` (1440px), because the FRAME-LOCK check below is a
  // comparison BETWEEN viewports — it needs at least two above the cap to have anything to
  // compare. Everything above 1440 must be pixel-identical relative to the game frame; these
  // two are what proves it. Before `--frame-inset` existed, scenery tracked the raw viewport
  // while game chrome tracked the capped/centred `.game-root`, so the two drifted apart by
  // (100vw - 1440) / 2 per side — measured as 120px of clock-under-scoreboard overlap at
  // 2000px, at no tested viewport below the cap.
  { width: 2000, height: 1000, label: 'past frame cap' },
  { width: 2600, height: 1000, label: 'far past frame cap' },
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
//
// 2j.2: `onPacketPicked` fires right after the packet-pick click, while the upcard reveal
// wheel (`useUpcardReveal`'s ~500ms `spinning` window) is still on screen. Every prior version
// of this function ran the audit only once, at the very end — by then the wheel's window had
// long since closed, which is exactly how its 1.458x fractional scale (35px box on 24x24 au
// art) shipped uncaught: the check existed, the bug was real, and the two never met because
// nothing sampled that ~500ms. A transient element needs to be sampled DURING its transient
// state, not just wherever the playthrough happens to be standing once it's done moving.
async function driveToBiddingState(
  page: import('@playwright/test').Page,
  onPacketPicked?: () => Promise<void>,
): Promise<void> {
  const clickIfPresent = async (re: RegExp): Promise<boolean> => {
    const btn = page.getByRole('button', { name: re });
    if ((await btn.count()) === 0) return false;
    await btn.first().click();
    return true;
  };
  await clickIfPresent(/^play$/i);
  // A fixed 400ms wait before the FIRST click after Play was flaky under a cold dev-server
  // page load (card art fetches can push the select screen's first render past 400ms) —
  // observed directly: `clickIfPresent(/pick packet 1/i)` returning false because the button
  // simply didn't exist yet at the 400ms mark. Poll for it instead of trusting the delay.
  for (let i = 0; i < 10; i++) {
    if (await clickIfPresent(/pick packet 1/i)) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
  // The upcard wheel fires on the loner_full_blind -> loner_blind_hand transition (that's
  // when `view.upcard` goes null -> non-null, RULES.md's "upcard turned" step), which is one
  // Pass past the packet pick, not the packet pick itself — the first version of this sample
  // fired right after picking the packet and always found nothing there, silently passing
  // regardless of the wheel's actual box size. Poll for the wheel rather than trusting a fixed
  // delay: it's a genuinely short (~500ms) window and exactly when it opens depends on how
  // many bot-turn delays land before it, which isn't worth hardcoding here.
  if (onPacketPicked) {
    // The 400ms wait above lands mid-transition, before the full-blind loner window's own
    // Pass button exists yet (there's a beat with no buttons at all while the packet pick
    // resolves) — a single clickIfPresent here is a no-op more often than not. Keep trying
    // until either the wheel shows up or the click genuinely has nothing left to do.
    for (let i = 0; i < 8; i++) {
      if (await page.locator('.upcard-wheel').count()) {
        await onPacketPicked();
        break;
      }
      await clickIfPresent(/^pass$/i);
      await page.waitForTimeout(120);
    }
  }
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
  const frameLock: { width: number; offsets: Record<string, number> }[] = [];

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch();
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(BASE_URL);

        // Sampled mid-transition, during the upcard wheel's own ~500ms window — see
        // driveToBiddingState's docstring for why this can't just be folded into the final
        // sample below.
        let wheelResult: unknown;
        await driveToBiddingState(page, async () => {
          wheelResult = await page.evaluate(AUDIT_SRC);
        });

        const result = await page.evaluate(AUDIT_SRC);
        // `scrollWidth`/`clientWidth` added alongside the pre-existing height check — direct
        // user feedback ("i cant see my cards anymore on screen") traced to a real bug this
        // check would have caught: `.game-root`'s `overflow-y: auto` was silently forcing
        // `overflow-x` to compute as `auto` too (a CSS spec quirk — one axis `visible` and the
        // other not computes the `visible` one to `auto`), which at narrow widths let
        // `.table-frame-roomy` open a HORIZONTAL scroll container whose left-overflowing
        // content was permanently unreachable (`scrollLeft` can't go negative). The pre-
        // existing check only ever compared height, so this shipped invisibly.
        const de = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const noScroll = de.scrollHeight === de.clientHeight && de.scrollWidth === de.clientWidth;

        // FRAME LOCK: every discrete prop's offset from the GAME FRAME's own left edge, so the
        // post-loop check can prove those offsets don't move once past the cap. Measured
        // against `.game-root` rather than the viewport on purpose — that is exactly the
        // distinction that was broken, and measuring against the viewport here would happily
        // pass while the bug was live.
        if (vp.width >= FRAME_CAP) {
          frameLock.push({
            width: vp.width,
            offsets: await page.evaluate(() => {
              const root = document.querySelector('.game-root');
              if (!root) return {};
              const x0 = root.getBoundingClientRect().left;
              const out: Record<string, number> = {};
              for (const sel of [
                '.scene-fireplace', '.scene-window', '.scene-picture', '.scene-clock',
                '.scene-shelf', '.scene-coat-hooks', '.scene-dresser', '.scene-woodpile',
                '.scene-hearth-mat', '.scene-farm-painting', '.table-frame', '.table-opponent',
              ]) {
                const el = document.querySelector(sel);
                if (!el || getComputedStyle(el).display === 'none') continue;
                out[sel] = Math.round(el.getBoundingClientRect().left - x0);
              }
              return out;
            }),
          });
        }

        const wheelOk = wheelResult === undefined || (wheelResult as { ok: boolean }).ok;
        const ok = (result as { ok: boolean }).ok && noScroll && wheelOk;
        const label = `${vp.width}x${vp.height} (${vp.label})`;
        if (ok) {
          console.log(`  OK    ${label}`);
        } else {
          failed = true;
          console.error(`  FAIL  ${label}`);
          if (!wheelOk) {
            console.error('  (during upcard wheel reveal)');
            console.error(JSON.stringify(wheelResult, null, 2));
          }
          if (!(result as { ok: boolean }).ok || !noScroll) {
            console.error(JSON.stringify({ ...(result as object), noScroll, ...de }, null, 2));
          }
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }

  // FRAME LOCK (2q.1). The game has exactly two coordinate systems: the raw VIEWPORT (the
  // room's continuous surfaces) and the capped, centred GAME FRAME (everything with a measured
  // relationship to anything else). They are identical below `--frame-cap` and diverge above
  // it, which is why a whole family of "it drifts / it overlaps at a big window" bugs existed
  // and why none of them reproduced at any tested size. Every offset below is measured FROM
  // the frame, so if a prop ever goes back to tracking the viewport its offset starts moving
  // between these two viewports and this fails — which no single-viewport check can see.
  if (frameLock.length >= 2) {
    const [base, ...rest] = frameLock;
    const drift: string[] = [];
    for (const s of rest) {
      for (const [sel, off] of Object.entries(s.offsets)) {
        const b = base!.offsets[sel];
        if (b === undefined) continue;
        if (Math.abs(off - b) > 1) {
          drift.push(`    ${sel}: ${b}px @${base!.width} -> ${off}px @${s.width}`);
        }
      }
    }
    if (drift.length) {
      failed = true;
      console.error('  FAIL  frame lock (scenery drifts from the game frame past the cap)');
      console.error(drift.join('\n'));
    } else {
      console.log(`  OK    frame lock (${Object.keys(base!.offsets).length} elements pinned past ${FRAME_CAP}px)`);
    }
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
