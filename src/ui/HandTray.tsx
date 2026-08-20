import { useLayoutEffect, useRef } from 'react';
import type { Action, Card as CardType, PlayerView } from '../../shared/engine/types.ts';
import { Card } from './Card.tsx';

/** The pickup motion (2e.5): a hand travels from ITS SEAT into the tray, rather than the
 *  tray just appearing — "like I'm physically picking them up." Replaces the earlier
 *  `hand-flip` keyframe, which rotated the tray in place with no reference to where the
 *  cards actually came from.
 *
 *  Hand-rolled FLIP (First-Last-Invert-Play), not a library: on mount, find the seat this
 *  hand just left (Table.tsx tags each with `data-seat`), read the delta between its centre
 *  and the tray's, and animate FROM that offset back to (0,0).
 *
 *  Two things that look like defensive over-engineering and are not:
 *
 *  1. **The `animatedFor` guard.** React 18 StrictMode intentionally invokes this effect
 *     TWICE per mount in dev, and the two calls are not equivalent here: the first genuinely
 *     measures the tray's from-scratch layout, but the effect's OWN style mutations
 *     (transform, then a forced reflow, then transform again) leave `el` in a state where a
 *     second synchronous call measures something else — observed in practice as the second
 *     call computing a zero delta and freezing the tray mid-shrink, permanently scaled down
 *     and half-transparent. Guarding on trayKey makes the effect idempotent, which is
 *     exactly what StrictMode's double-invocation is designed to require.
 *  2. **The `requestAnimationFrame` before measuring `to`.** Without it, `to` was observed to
 *     be measured before the browser had settled this element's real flex layout — a `to` of
 *     (0, 484) one frame, (224, 379) the next, for the identical settled element. One frame's
 *     grace is enough for layout to catch up before the FLIP math runs. */
function PickupTray({ trayKey, children }: { trayKey: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const animatedFor = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respected in JS rather than a CSS media-query guard, because the animation itself is
    // JS-driven (inline styles, not a CSS class) — a `@media (prefers-reduced-motion)` rule
    // has nothing to cancel here.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (animatedFor.current === trayKey) return;
    animatedFor.current = trayKey;

    const seat = document.querySelector<HTMLElement>(`[data-seat="${trayKey}"]`);
    const from = seat?.getBoundingClientRect();

    requestAnimationFrame(() => {
      const to = el.getBoundingClientRect();
      el.style.transition = 'none';
      if (from) {
        const dx = from.left + from.width / 2 - (to.left + to.width / 2);
        const dy = from.top + from.height / 2 - (to.top + to.height / 2);
        el.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
        el.style.opacity = '0.3';
      } else {
        // Shouldn't happen — the acting hand's seat is always rendered — but falls back to
        // a plain fade rather than throwing if a future refactor ever breaks that invariant.
        el.style.transform = 'translateY(12px)';
        el.style.opacity = '0.3';
      }

      // Force the browser to commit the starting frame before switching to the transitioned
      // end state — without this reflow, the two style writes coalesce into one and there is
      // no motion, only a jump straight to the end.
      void el.offsetHeight;

      el.style.transition = 'transform 220ms cubic-bezier(0.22, 0.9, 0.3, 1.1), opacity 180ms ease-out';
      el.style.transform = 'translate(0, 0) scale(1)';
      el.style.opacity = '1';
    });
  }, [trayKey]);

  return (
    <div className="hand-tray-cards" ref={ref} key={trayKey}>
      {children}
    </div>
  );
}

function cardsEqual(a: CardType, b: CardType): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** The tray always shows the human's whole acting hand — not just the legal subset — with
 *  legal cards glowing and the rest dimmed. Per the design spec: highlight legal plays, don't
 *  hide the rest of the hand. `legal` is already scoped to the human player, so a non-empty
 *  card-action list here means it's genuinely their turn.
 *
 *  During bidding your selected hand is visible too ("like regular euchre" — you pick your
 *  cards up and look at them before ordering up), but that's rendered at the SEAT now
 *  (Table.tsx, `visibleCards`) rather than a second time here — "the hands should be on the
 *  table" was the whole point, and a duplicate read-only strip in the tray just repeated what
 *  the seat already shows, in the wrong physical position for it. This component now only
 *  ever renders the ACTING hand. */
export function HandTray({
  view,
  legal,
  play,
  frozen = false,
}: {
  view: PlayerView;
  legal: Action[];
  play: (a: Action) => void;
  /** True while a finished trick is still on the table. Play is frozen then so the next card
   *  cannot land on top of one the player is still reading — and the cards are visibly
   *  disabled rather than silently swallowing a click the player thinks landed. */
  frozen?: boolean;
}) {
  const cardActions = legal.filter(
    (a): a is Extract<Action, { type: 'PLAY_CARD' | 'DEALER_DISCARD' }> =>
      a.type === 'PLAY_CARD' || a.type === 'DEALER_DISCARD',
  );

  if (cardActions.length > 0 && view.actingHand) {
    const fullHand =
      view.actingHand.role === 'selected' ? view.ownSelectedHand : view.ownBlindHand;
    if (!fullHand) return null;

    const label =
      view.phase === 'dealer_exchange' ? 'Choose a card to discard' : 'Your turn — play a card';

    // Keying on the acting hand's identity forces React to remount this container whenever
    // the human switches which of their two hands is up — which is exactly when the flip
    // should replay. Same hand acting again (e.g. after going alone) keeps the same key, so
    // it stays still rather than re-flipping into itself.
    const trayKey = `${view.actingHand.player}-${view.actingHand.role}`;

    return (
      <div className="hand-tray">
        <div className="hand-tray-label">{label}</div>
        <PickupTray trayKey={trayKey}>
          {fullHand.map((card, i) => {
            const action = frozen ? undefined : cardActions.find((a) => cardsEqual(a.card, card));
            return (
              <Card
                key={i}
                card={card}
                onClick={action ? () => play(action) : undefined}
                highlighted={!!action}
                dimmed={!action}
              />
            );
          })}
        </PickupTray>
      </div>
    );
  }

  return null;
}
