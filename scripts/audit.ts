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
/** Mirrors `--frame-height-cap` in index.css — the same fact on the vertical axis. Above this
 *  height `.game-root` stops growing (letterboxed via `margin-block: auto`) and the whole
 *  composition must hold still relative to it too, the exact bug the felt-notch shipped as:
 *  `.scene-farm-painting` tracked the raw viewport top while the felt inside `.game-root` had
 *  already started letterboxing away from it. */
const FRAME_HEIGHT_CAP = 1000;
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
  // Exercises the farm painting's lowered height gate: it is shown here, so a collision with
  // the rising felt at this height would fail rather than ship.
  { width: 1400, height: 840, label: 'short desktop, painting gate floor' },
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
  // TWO viewports past `--frame-cap` (1440px), because the VIEWPORT-LOCK check below is a
  // comparison BETWEEN viewports — it needs at least two above the cap to have anything to
  // compare. Above the cap the room and the scoreboard must both stay welded to the screen
  // edges while the game box stops growing; these two are what proves it. The original bug:
  // scenery tracked the viewport while the scoreboard tracked the capped/centred `.game-root`,
  // so they drifted apart by (100vw - 1440) / 2 per side — measured as 120px of
  // clock-under-scoreboard overlap at 2000px, at no tested viewport below the cap.
  { width: 2000, height: 1000, label: 'past frame cap' },
  { width: 2600, height: 1000, label: 'far past frame cap' },
  // TWO viewports past `--frame-height-cap` (1000px), the vertical counterpart of the pair
  // above — the VERTICAL VIEWPORT-LOCK check needs two heights above the cap to compare. 1800
  // wide (not 1400) so `.scene-farm-painting` is actually on screen to check (it's gated
  // behind `min-width: 1100px`). This pair is what catches the room floating off its own
  // floor: measured at 1800x1700 while the room was letterboxed with the game box, the floor
  // sat at the true bottom while the fireplace, dresser and woodpile hovered ~344px above it.
  { width: 1800, height: 1300, label: 'past frame height cap' },
  { width: 1800, height: 1700, label: 'far past frame height cap' },
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

/** Given the same elements measured at two or more viewport sizes, report the ones that are
 *  welded to NEITHER edge of their axis.
 *
 *  Each element contributes two readings — its distance from each edge (`[L]`/`[R]`, or
 *  `[T]`/`[B]`) — and passing requires only that ONE of them hold still across every sampled
 *  size. That is exactly what "anchored to a screen edge" means, and checking it this way needs
 *  no hand-maintained table of which prop uses which edge: the fireplace hangs off the left, the
 *  window and dresser off the right, wall art from the top, furniture from the floor, and all of
 *  them are correct. An element that moves on BOTH edges is tracking something else entirely —
 *  in practice the capped, centred game box — which is the bug this exists to catch.
 */
function edgeDrift(
  samples: { size: number; offsets: Record<string, number> }[],
  edges: [string, string],
): string[] {
  const [base, ...rest] = samples;
  if (!base || !rest.length) return [];
  const names = new Set(Object.keys(base.offsets).map((k) => k.replace(/ \[[LRTB]\]$/, '')));
  const drift: string[] = [];
  for (const name of names) {
    const readings = edges.map((e) => {
      const key = `${name} ${e}`;
      const b = base.offsets[key];
      if (b === undefined) return null;
      const moved = rest.filter((s) => Math.abs((s.offsets[key] ?? b) - b) > 1);
      return { edge: e, base: b, moved };
    });
    const known = readings.filter((r): r is NonNullable<typeof r> => r !== null);
    if (!known.length) continue;
    // Held still on at least one edge -> correctly anchored, nothing to report.
    if (known.some((r) => r.moved.length === 0)) continue;
    const worst = known[0]!;
    const to = worst.moved.map((s) => `${s.offsets[`${name} ${worst.edge}`]}px @${s.size}`).join(', ');
    drift.push(`    ${name}: neither edge held (${worst.edge} ${worst.base}px @${base.size} -> ${to})`);
  }
  return drift;
}

async function main(): Promise<void> {
  const server: ChildProcess = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' },
  );
  let failed = false;
  const frameLock: { width: number; offsets: Record<string, number> }[] = [];
  const frameLockY: { height: number; offsets: Record<string, number> }[] = [];

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
        // post-loop check can prove those offsets don't move once past the cap. Measured from
        // the VIEWPORT's own left edge, and the left `.score-slot` is measured alongside the
        // scenery on purpose: the room and the scoreboard are the two things that anchor to a
        // horizontal EDGE (everything else — banner, opponent, trays, seats — is centred), so
        // this list passing is the proof that they share one coordinate system and therefore
        // cannot drift into each other. An earlier version measured against `.game-root`
        // instead, which encoded the opposite (and wrong) rule: it demanded the room hold
        // still relative to the capped box, which is exactly what left the fireplace and
        // window floating mid-wall with bare screen beyond them.
        if (vp.width >= FRAME_CAP) {
          frameLock.push({
            width: vp.width,
            offsets: await page.evaluate(() => {
              const out: Record<string, number> = {};
              for (const sel of [
                '.scene-fireplace', '.scene-window', '.scene-picture', '.scene-clock',
                '.scene-shelf', '.scene-dresser', '.scene-woodpile',
                '.scene-hearth-mat',
                // Chrome, not room — but pinned to the screen edges all the same (direct user
                // feedback: the bottom bar "should span the screen width no matter what the
                // zoom"). As an absolute child of the capped game box it drifted in from both
                // edges past 1440px; listing it here is what makes that a failure.
                '.action-bar',
              ]) {
                for (const el of document.querySelectorAll(sel)) {
                  if (getComputedStyle(el).display === 'none') continue;
                  const r = el.getBoundingClientRect();
                  // BOTH distances, because a prop is anchored to ONE edge and which one
                  // differs per prop (the fireplace hangs off the left, the window and dresser
                  // off the right). The comparison below asks only that ONE of the pair holds
                  // still — that is what "welded to a screen edge" means, and it needs no
                  // hand-maintained list of which prop uses which edge to go stale.
                  out[`${sel} [L]`] = Math.round(r.left);
                  out[`${sel} [R]`] = Math.round(innerWidth - r.right);
                }
              }
              // Both score slots, by index — they are the two corners of the one piece of
              // chrome that anchors to a horizontal edge, and the whole point of the fix is
              // that they now share the room's coordinate system.
              [...document.querySelectorAll('.score-slot')].forEach((el, i) => {
                const r = el.getBoundingClientRect();
                out[`.score-slot#${i} [L]`] = Math.round(r.left);
                out[`.score-slot#${i} [R]`] = Math.round(innerWidth - r.right);
              });
              return out;
            }),
          });
        }

        // VERTICAL VIEWPORT LOCK: the same measurement rotated onto the height axis, and the
        // check that would have caught the floating-room bug directly. The floor plane always
        // reaches the true bottom of the screen, so anything STANDING on it has to be measured
        // from that same bottom — props are measured by their distance from the viewport's
        // bottom edge here for exactly that reason. When the room was briefly letterboxed with
        // the game box, this list drifted by ~344px between the two heights below while the
        // floor stayed put, which is precisely the gap that opened under the fireplace.
        if (vp.height > FRAME_HEIGHT_CAP) {
          frameLockY.push({
            height: vp.height,
            offsets: await page.evaluate(() => {
              const out: Record<string, number> = {};
              for (const sel of [
                '.scene-floor', '.scene-fireplace', '.scene-window', '.scene-dresser',
                '.scene-woodpile', '.scene-hearth-mat', '.scene-picture', '.scene-clock',
                '.scene-farm-painting', '.status-banner', '.action-bar',
              ]) {
                const el = document.querySelector(sel);
                if (!el || getComputedStyle(el).display === 'none') continue;
                const r = el.getBoundingClientRect();
                // Same both-edges rule as the horizontal check: wall art hangs from the top,
                // furniture stands on the floor at the bottom, and each only has to hold ONE
                // of them still. `.scene-floor` is the control (its bottom anchoring was never
                // in doubt), and the banner/action-bar are included because they are the two
                // pieces of chrome pinned to a screen edge — the ones that drifted inward when
                // the vertical cap was on `.game-root` instead of `.table-area`.
                out[`${sel} [T]`] = Math.round(r.top);
                out[`${sel} [B]`] = Math.round(innerHeight - r.bottom);
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

  // VIEWPORT LOCK (2q.1, corrected in 2q.4). The game has exactly two coordinate systems: the
  // raw VIEWPORT (the ROOM — every scene prop, plus the scoreboard, which reads as a tally on
  // that room's wall) and the capped, centred GAME BOX (the table, the opponent, the seats and
  // the trays). They are identical below the caps and diverge above them, which is why a whole
  // family of "it drifts / it overlaps / it floats at a big window" bugs existed and why none
  // of them reproduced at any tested size. Every offset below is measured FROM THE VIEWPORT
  // EDGE, so if a room element is ever moved into the game box its offset starts changing
  // between these two viewports and this fails — which no single-viewport check can see.
  if (frameLock.length >= 2) {
    const drift = edgeDrift(
      frameLock.map((s) => ({ size: s.width, offsets: s.offsets })),
      ['[L]', '[R]'],
    );
    if (drift.length) {
      failed = true;
      console.error('  FAIL  viewport lock (a room element drifts from the screen edge past the cap)');
      console.error(drift.join('\n'));
    } else {
      const n = new Set(Object.keys(frameLock[0]!.offsets).map((k) => k.replace(/ \[[LRTB]\]$/, ''))).size;
      console.log(`  OK    viewport lock (${n} elements pinned past ${FRAME_CAP}px)`);
    }
  }

  // VERTICAL VIEWPORT LOCK (2q.2, corrected in 2q.4) — the same reasoning as the horizontal
  // check above, on the height axis. `.scene-floor` is deliberately first in the measured list:
  // it is the one element whose bottom-edge anchoring was never in doubt, so it doubles as the
  // control. Every other prop in the room stands ON it and must hold the same distance from the
  // screen's bottom edge that it does — which is exactly what stopped being true when the room
  // was briefly letterboxed with the game box, leaving the fireplace hovering above its floor.
  if (frameLockY.length >= 2) {
    const drift = edgeDrift(
      frameLockY.map((s) => ({ size: s.height, offsets: s.offsets })),
      ['[T]', '[B]'],
    );
    if (drift.length) {
      failed = true;
      console.error('  FAIL  vertical viewport lock (a room element drifts off the floor past the height cap)');
      console.error(drift.join('\n'));
    } else {
      const n = new Set(Object.keys(frameLockY[0]!.offsets).map((k) => k.replace(/ \[[LRTB]\]$/, ''))).size;
      console.log(`  OK    vertical viewport lock (${n} elements pinned past ${FRAME_HEIGHT_CAP}px)`);
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
