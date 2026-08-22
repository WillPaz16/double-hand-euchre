/**
 * Scale audit — the invariant this project failed silently for three phases, twice over.
 *
 * Every piece of pixel art must render at a WHOLE-NUMBER multiple of its true resolution.
 * Nothing else keeps a pixel the same physical size across the screen, and nothing else
 * stops a downscale from deforming art (0.6x dropped rows irregularly and visibly bent the
 * Old-Timer's moustache; 0.25x threw away 80% of the card back's lattice).
 *
 * The rule was written down twice — in Card.tsx ("Exactly half, never an in-between size")
 * and in the design spec §7 ("scales by a whole-number factor") — and violated in three
 * places anyway, because it was only ever checked by eye, per-component, at one viewport.
 * This checks it globally, numerically, at every viewport that matters.
 *
 * **2h.1 added a fourth check, for the same underlying reason: chrome collision.** 2g.4's
 * wall furniture placement was verified once, at one viewport (1280x860), with a snippet that
 * lived nowhere. It shipped a regression invisible to every check above it — the props weren't
 * mis-scaled and weren't off the viewport, they were simply UNDER the scoreboard and status
 * banner at 375x812, up to 89% hidden. "Checked once, by hand, at one size" is exactly the
 * failure this file exists to replace; extending it rather than writing a second script keeps
 * that lesson in one place.
 *
 * Run via `npm run audit` (Playwright, headless, all four target viewports — see
 * scripts/audit.ts), or paste this IIFE into a browser console / execute via a preview tool's
 * javascript_tool for a one-off check. Returns a report object; `ok` is what to look at.
 */
(() => {
  const EPS = 0.02; // sub-pixel layout rounding, not a real fractional scale

  const isWhole = (n) => Math.abs(n - Math.round(n)) < EPS;

  const naturalOf = (url) =>
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res([i.naturalWidth, i.naturalHeight]);
      i.onerror = () => res(null);
      i.src = url;
    });

  return (async () => {
    const findings = [];

    // --- <img> elements: rendered box vs the file's own pixels ---------------------------
    for (const img of document.querySelectorAll('img')) {
      if (!img.naturalWidth) continue;
      const cs = getComputedStyle(img);
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      if (!w || !h) continue;
      const sx = w / img.naturalWidth;
      const sy = h / img.naturalHeight;
      if (!isWhole(sx) || !isWhole(sy)) {
        findings.push({
          kind: 'img',
          src: img.src.split('/').slice(-2).join('/'),
          natural: [img.naturalWidth, img.naturalHeight],
          rendered: [w, h],
          scale: [+sx.toFixed(3), +sy.toFixed(3)],
        });
      }
    }

    // --- CSS background images ------------------------------------------------------------
    // Tiles legitimately repeat, so the element's own box says nothing about scale — what
    // matters is background-size against the file's natural size.
    const seen = new Set();
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const m = cs.backgroundImage.match(/url\("([^"]+)"/);
      if (!m) continue;
      const key = m[1] + '|' + cs.backgroundSize;
      if (seen.has(key)) continue;
      seen.add(key);

      const nat = await naturalOf(m[1]);
      if (!nat) continue;

      let bw;
      let bh;
      if (cs.backgroundSize === 'auto' || cs.backgroundSize === 'auto auto') {
        [bw, bh] = nat; // drawn at its own pixel size: scale 1, always fine
      } else {
        const parts = cs.backgroundSize.split(' ');
        bw = parseFloat(parts[0]);
        bh = parts[1] ? parseFloat(parts[1]) : bw;
        if (cs.backgroundSize.includes('%')) {
          const r = el.getBoundingClientRect();
          bw = (parseFloat(parts[0]) / 100) * r.width;
          bh = ((parts[1] ? parseFloat(parts[1]) : parseFloat(parts[0])) / 100) * r.height;
        }
      }
      if (!bw || !bh) continue;

      const sx = bw / nat[0];
      const sy = bh / nat[1];
      if (!isWhole(sx) || !isWhole(sy)) {
        findings.push({
          kind: 'background',
          sel: el.className || el.tagName.toLowerCase(),
          src: m[1].split('/').slice(-2).join('/'),
          natural: nat,
          rendered: [+bw.toFixed(1), +bh.toFixed(1)],
          scale: [+sx.toFixed(3), +sy.toFixed(3)],
        });
      }
    }

    // --- Scenery must be CROPPED by the viewport, never clipped out of existence ----------
    // The min-width gate was supposed to guarantee this and did not: at 1010px it revealed
    // scenery already hanging 25px off the left edge, because the gate was derived from a
    // table width that had since changed.
    // Ambient light washes are EXEMPT: they're deliberately oversized gradients meant to
    // bleed past the object casting them (firelight, moonlight, the hearth's room-wide glow,
    // the vignette), not discrete objects a player needs to recognize. Found by this check
    // itself flagging .scene-moonlight at 51% lost on a phone — correctly measuring the glow,
    // incorrectly treating "glow bleeds off-canvas" as the same bug as "sprite got clipped".
    const AMBIENT = /glow|light|vignette/;
    // Sprite-sheet STRIPS are exempt for the same underlying reason, caught by this check
    // flagging .scene-fire-strip at 57% lost: a strip is wider than its own frame by design
    // (4 fire frames side by side sliding behind a 1-frame window) and is already clipped by
    // its immediate parent's `overflow: hidden`. Checking it against the VIEWPORT edge is the
    // wrong boundary — it was never meant to fit there, only inside its own frame, which it
    // already does. General rather than name-matched: any element already clipped by a
    // smaller `overflow: hidden` parent has a real crop boundary that isn't the viewport, so
    // measuring it against the viewport can't tell you anything true.
    const clippedByOwnParent = (el) => {
      const p = el.parentElement;
      if (!p) return false;
      const pcs = getComputedStyle(p);
      if (pcs.overflow !== 'hidden' && pcs.overflowX !== 'hidden' && pcs.overflowY !== 'hidden') {
        return false;
      }
      const pr = p.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      return er.width > pr.width || er.height > pr.height;
    };
    const offscreen = [];
    for (const el of document.querySelectorAll('[class*="scene-"]')) {
      if (AMBIENT.test(el.className)) continue;
      if (clippedByOwnParent(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.backgroundImage === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const hiddenL = Math.max(0, -r.left);
      const hiddenR = Math.max(0, r.right - innerWidth);
      // A little bleed is the point of a cropped stage; losing most of an object is not.
      const lost = (hiddenL + hiddenR) / r.width;
      if (lost > 0.5) {
        offscreen.push({ sel: el.className, lostFraction: +lost.toFixed(2) });
      }
    }

    // --- Scenery must not be swallowed by GAMEPLAY CHROME (2h.1) ---------------------------
    // The offscreen check above answers "is this cropped by the viewport", which is a
    // deliberate part of the stage design (§11: "cropped, not hidden"). It has no opinion on a
    // prop being covered by another IN-PAGE element — which is exactly the bug that shipped in
    // 2g.4: the wall furniture was placed as au offsets from a viewport edge, so it held at
    // 1280px and collapsed at 375px, where the scoreboard and status banner occupy far more of
    // the top of the screen. Measured after the fact: the picture 89% behind the scoreboard,
    // the clock 80%, the antlers 65% behind the banner, the coat hooks 58% behind the
    // opponent. scale-audit had nothing to say about any of it, because collision with other
    // elements was never a thing it checked — only collision with the viewport edge.
    //
    // CHROME_SELECTORS is deliberately a short, explicit list rather than "everything with a
    // higher z-index": the felt legitimately overlaps the rug's near edge (the table standing
    // ON the rug is the point, per 2f.5/2g.4), so blanket z-index comparison would flag a
    // correct composition. Chrome is the stuff that is guaranteed to be in front for reasons
    // that have nothing to do with staging — the scoreboard, the banner, the hand trays, the
    // opponent's own sprite — and a decorative prop should never lose a fight with any of it.
    // `.score-slot`, not `.scoreboard` — the scoreboard is a flex CONTAINER spanning the full
    // width with `justify-content: space-between`, so its own bounding box includes the empty
    // middle between the two corner tallies. Checking against it produced a false positive at
    // 1010px (a prop 55% "hidden by the scoreboard" that in fact sat entirely in the empty gap
    // between the two visible corner boxes). Checking the two `.score-slot` children instead
    // measures what is actually opaque on screen.
    const CHROME_SELECTORS = [
      '.score-slot',
      '.status-banner',
      '.hand-tray',
      '.table-opponent',
      '.seat-fan',
    ];
    const COLLISION_CEILING = 0.35; // a little overlap at an edge is fine; losing a third isn't
    const collisions = [];
    for (const el of document.querySelectorAll('[class*="scene-"]')) {
      if (AMBIENT.test(el.className) || clippedByOwnParent(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.backgroundImage === 'none') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      for (const sel of CHROME_SELECTORS) {
        for (const chrome of document.querySelectorAll(sel)) {
          const c = chrome.getBoundingClientRect();
          const ow = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left));
          const oh = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
          const frac = (ow * oh) / (r.width * r.height);
          if (frac > COLLISION_CEILING) {
            collisions.push({
              sel: el.className,
              hiddenBy: sel,
              pctHidden: +(frac * 100).toFixed(0),
            });
          }
        }
      }
    }

    return {
      viewport: [innerWidth, innerHeight],
      px: getComputedStyle(document.documentElement).getPropertyValue('--px').trim() || '(unset)',
      ok: findings.length === 0 && offscreen.length === 0 && collisions.length === 0,
      fractionalScales: findings,
      mostlyOffscreen: offscreen,
      chromeCollisions: collisions,
    };
  })();
})();
