import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** Tween a container's children between layout positions instead of letting them jump (FLIP).
 *
 *  Card fans are laid out by the flow — flex, negative margins, a `gap` — so removing one card
 *  re-centres every sibling in a single frame. There is nothing to transition, because no
 *  animatable property changed: the cards are simply somewhere else now. This measures where
 *  each child WAS, lets the browser lay out where it now IS, then puts every child back where
 *  it started and releases it, so the layout change plays as motion.
 *
 *  Two details that are load-bearing:
 *
 *  1. **`offsetLeft`/`offsetTop`, not `getBoundingClientRect()`.** Every card in a fan already
 *     carries a `rotate()`, and a bounding rect includes transforms — so when a card's
 *     rotation rule changes (which is exactly when the fan re-splays) the rect delta mixes the
 *     rotation change into the position delta and the card gets flung sideways. Offsets are
 *     pure layout and ignore the transform entirely, which is what leaves the rotation free to
 *     be animated separately by its own CSS transition.
 *  2. **The offset goes into `--flip-x`/`--flip-y`, not into `transform`.** The transform
 *     belongs to the stylesheet (`rotate(var(--rot))`, plus the hover lift in the tray);
 *     writing an inline transform here would clobber whichever of those applied. Both
 *     variables default to `0px` in CSS, so an element this hook never touches is unaffected.
 *
 *  Honoured for `prefers-reduced-motion`: positions are still recorded (so the first move after
 *  the setting changes isn't measured against stale coordinates) but never played back. */
export function useFlip(ref: RefObject<HTMLElement | null>): void {
  // Deliberately runs after EVERY render rather than on a dependency list: the thing being
  // watched is the laid-out position of the children, which no dependency array can express —
  // a card can move because a sibling was removed, because the container resized, or because a
  // count-driven rotation rule changed its neighbours' widths.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    // Optional call, not a bare one: `matchMedia` is absent in the bare DOM some of the
    // component tests render into, and this hook runs on every table render — so assuming it
    // exists throws during layout effects and takes the whole render down with it. Treating a
    // missing implementation as "no preference expressed" is also the right default for the
    // real thing: motion is the normal case, reduced motion is the opt-out.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const moved: HTMLElement[] = [];

    for (const kid of kids) {
      const prevX = Number(kid.dataset.flipX ?? NaN);
      const prevY = Number(kid.dataset.flipY ?? NaN);
      const x = kid.offsetLeft;
      const y = kid.offsetTop;
      kid.dataset.flipX = String(x);
      kid.dataset.flipY = String(y);
      // First sight of this element — no previous position to tween from.
      if (reduced || Number.isNaN(prevX)) continue;
      const dx = prevX - x;
      const dy = prevY - y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      kid.style.transition = 'none';
      kid.style.setProperty('--flip-x', `${dx}px`);
      kid.style.setProperty('--flip-y', `${dy}px`);
      moved.push(kid);
    }

    if (moved.length === 0) return;
    // One forced reflow for the whole batch, not one per card: without it the browser
    // coalesces both writes and the cards go straight to their end state with no motion.
    void el.offsetHeight;
    for (const kid of moved) {
      kid.style.transition = '';
      kid.style.setProperty('--flip-x', '0px');
      kid.style.setProperty('--flip-y', '0px');
    }
  });
}
