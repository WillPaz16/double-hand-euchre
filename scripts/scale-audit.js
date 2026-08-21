/**
 * Scale audit — the invariant this project failed silently for three phases.
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
 * Run: paste into the browser console on a running dev server, or execute via the
 * preview tool's javascript_tool. Returns a report object; `ok` is the thing to look at.
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
    const offscreen = [];
    for (const el of document.querySelectorAll('[class*="scene-"]')) {
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

    return {
      viewport: [innerWidth, innerHeight],
      px: getComputedStyle(document.documentElement).getPropertyValue('--px').trim() || '(unset)',
      ok: findings.length === 0 && offscreen.length === 0,
      fractionalScales: findings,
      mostlyOffscreen: offscreen,
    };
  })();
})();
