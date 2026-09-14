import { useLayoutEffect, useRef } from 'react';
import type { Action, Card as CardType, PlayerView } from '../../shared/engine/types.ts';
import { sortHandForDisplay } from '../../shared/engine/index.ts';
import { Card } from './Card.tsx';
import { BIDDING_PHASES } from './Table.tsx';
import { useOpponentName } from './opponentIdentity.tsx';

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

/** The tray shows whichever hand is currently HELD (Table.tsx, `isHeld`) — not just the
 *  legal subset, with legal cards glowing and the rest dimmed. Per the design spec: highlight
 *  legal plays, don't hide the rest of the hand.
 *
 *  Two held cases, both driven by the same PickupTray so both get the same "picked up from
 *  the table" motion:
 *    1. The acting hand during play/dealer_exchange — legal actions exist, cards are
 *       clickable.
 *    2. Your selected hand during bidding — "when you go to call trump, the hand you
 *       selected should come up into your hand so you can see the cards", i.e. like regular
 *       euchre, you look at your cards before bidding on them rather than reading them off
 *       the table from across it. Read-only: there is no PLAY_CARD/DEALER_DISCARD action to
 *       attach here, bidding actions live in BidPanel. */
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
  const opponentName = useOpponentName();
  const cardActions = legal.filter(
    (a): a is Extract<Action, { type: 'PLAY_CARD' | 'DEALER_DISCARD' }> =>
      a.type === 'PLAY_CARD' || a.type === 'DEALER_DISCARD',
  );

  // Root cause of a real, measured bug — direct user feedback: "after a trick is collected the
  // table size changes." `.table-frame` itself never moves (confirmed live with a
  // ResizeObserver through several tricks); what actually collapses is THIS component: `legal`
  // is always computed for the human (see useGame.ts), so the instant a completed trick's
  // winner is the BOT and it leads next, `cardActions` is empty for the ~1.3s hold — and the
  // branch below returns null, so the tray vanishes and the felt visually expands to fill the
  // gap. That reads exactly like "the table got bigger" even though no element's own box ever
  // changed size. Reserving this row's height during the WHOLE hold, regardless of whose turn
  // is next, is the direct fix — deliberately not trying to guess which of the human's two
  // hands to display instead (there is no correct answer when the bot is the one acting).
  //
  // Same failure mode, different trigger — direct user feedback: "the table glitch happens
  // when old timer pulls cards." `dealer_exchange` is the ONE other phase where `legal` can be
  // empty for a reason that has nothing to do with there being no hand to show: when the BOT is
  // dealer, `DEALER_DISCARD` is gated to `player === state.dealer` (shared/engine/legal.ts), so
  // `legalActions(state, HUMAN)` returns nothing for the whole time the bot is picking up the
  // kitty and exchanging a card — the tray vanished for that window too, same felt-expands
  // glitch, just never patched for this phase.
  if (
    !(cardActions.length > 0 && view.actingHand) &&
    (frozen || view.phase === 'dealer_exchange')
  ) {
    return (
      <div className="hand-tray">
        <div className="hand-tray-label">
          {frozen ? 'Trick complete…' : `${opponentName} is exchanging…`}
        </div>
        <div className="hand-tray-cards hand-tray-cards-placeholder" aria-hidden="true" />
      </div>
    );
  }

  if (cardActions.length > 0 && view.actingHand) {
    const fullHand =
      view.actingHand.role === 'selected' ? view.ownSelectedHand : view.ownBlindHand;
    if (!fullHand) return null;

    // `frozen` comes first: while a finished trick is still on the table every card below is
    // disabled, and the label used to ignore that entirely — so for the whole ~1.3s hold the
    // tray read "Your turn — play a card" while refusing every click. Being told to act at the
    // exact moment input is being rejected is worse than no label at all; it reads as the game
    // having missed your click. Say what is actually happening instead.
    const label = frozen
      ? 'Trick complete…'
      : view.phase === 'dealer_exchange'
        ? 'Choose a card to discard'
        : 'Your turn: play a card';

    // Keying on the acting hand's identity forces React to remount this container whenever
    // the human switches which of their two hands is up — which is exactly when the flip
    // should replay. Same hand acting again (e.g. after going alone) keeps the same key, so
    // it stays still rather than re-flipping into itself.
    const trayKey = `${view.actingHand.player}-${view.actingHand.role}`;

    return (
      <div className="hand-tray">
        <div className="hand-tray-label">{label}</div>
        <PickupTray trayKey={trayKey}>
          {/* Sorted for reading, not dealt order: trump leftmost, then by suit, strongest
              first within each. Keyed by the card itself rather than by index so React keeps
              each <Card> attached to its own card when the order changes — an index key here
              would make every re-sort look like every card was replaced, which is exactly what
              PickupTray's FLIP animation would then animate. */}
          {sortHandForDisplay(fullHand, view.trump).map((card) => {
            const action = frozen ? undefined : cardActions.find((a) => cardsEqual(a.card, card));
            return (
              <Card
                key={`${card.suit}-${card.rank}`}
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

  if (BIDDING_PHASES.has(view.phase) && view.ownSelectedHand) {
    // Same seat-key convention as the acting-hand branch above, so PickupTray's FLIP
    // animation finds the right `data-seat` origin (Table.tsx tags every seat, not just the
    // acting one) regardless of which branch is rendering.
    const trayKey = `${view.you}-selected`;
    return (
      <div className="hand-tray">
        <div className="hand-tray-label">Your hand</div>
        <PickupTray trayKey={trayKey}>
          {/* No `dimmed` here — that prop means "not a legal play right now" (see the
              play-phase branch above, where SOME cards are clickable and others aren't). None
              of these cards are ever clickable; bidding actions live in BidPanel, not here.
              Dimming all five for a reason that doesn't apply just made your own hand harder
              to read at the exact moment you picked it up specifically to read it. */}
          {sortHandForDisplay(view.ownSelectedHand, view.trump).map((card) => (
            <Card key={`${card.suit}-${card.rank}`} card={card} />
          ))}
        </PickupTray>
      </div>
    );
  }

  return null;
}
