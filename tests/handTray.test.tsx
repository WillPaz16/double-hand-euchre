/** @vitest-environment jsdom */
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, PlayerView } from '../shared/engine/types.ts';
import { HUMAN } from '../src/game/useGame.ts';
import { HandTray } from '../src/ui/HandTray.tsx';

afterEach(cleanup);

// jsdom does not implement matchMedia at all — HandTray's prefers-reduced-motion check needs
// something here or every render throws before the effect under test ever runs.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});

const CARDS: Card[] = [
  { rank: '9', suit: 'hearts' },
  { rank: '10', suit: 'hearts' },
];

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: HUMAN,
    phase: 'bidding_round1',
    dealer: HUMAN,
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: CARDS,
    ownBlindHand: null,
    opponentSelectedCount: 5,
    opponentBlindCount: 5,
    opponentSelectedHand: null,
    opponentBlindHand: null,
    upcard: null,
    turnedDownSuit: null,
    trump: null,
    maker: null,
    lonerTier: null,
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 1,
    actingHand: null,
    ...overrides,
  };
}

/** The `animatedFor` guard in PickupTray exists specifically because React 18/19 StrictMode
 *  invokes this effect TWICE per mount in dev, and an unguarded version was observed to freeze
 *  the tray mid-shrink (permanently scaled down and half-transparent) — see the component's
 *  own docstring. jsdom has no real layout engine, so the geometry-dependent SYMPTOM (a wrong
 *  delta computed from the first invocation's own style mutations) can't be reproduced here.
 *  What CAN be verified directly, without depending on real layout: the guard's actual job is
 *  to make a second same-key invocation a no-op, and the most direct observable proof of that
 *  is that only ONE requestAnimationFrame ends up scheduled even though StrictMode calls the
 *  effect twice. */
describe('HandTray / PickupTray FLIP idempotency guard', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vi.spyOn's inferred type
  // for window.requestAnimationFrame's overloaded signature doesn't widen cleanly to a
  // pre-declared `let`; the call-count assertions below don't need the precise type.
  let rafSpy: any;

  beforeEach(() => {
    rafSpy = vi.spyOn(window, 'requestAnimationFrame');
  });

  it('schedules exactly one animation frame per mount outside StrictMode', () => {
    render(<HandTray view={makeView()} legal={[]} play={vi.fn()} />);
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it('StrictMode double-invokes the effect, but the guard still schedules only one frame', () => {
    render(
      <StrictMode>
        <HandTray view={makeView()} legal={[]} play={vi.fn()} />
      </StrictMode>,
    );
    // If the `animatedFor` guard were removed, this would be 2 — StrictMode really does call
    // a mount effect with no cleanup function twice, and this test would catch that regression.
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it('a real hand change (different trayKey) schedules a fresh animation', () => {
    // Starts holding the SELECTED hand during bidding (trayKey "A-selected")...
    const { rerender } = render(<HandTray view={makeView()} legal={[]} play={vi.fn()} />);
    expect(rafSpy).toHaveBeenCalledTimes(1);

    // ...then switches to acting with the BLIND hand instead — a genuinely different trayKey
    // ("A-blind"), which must NOT be swallowed by the same guard that blocks StrictMode's
    // replay of the identical key. (Using the same role here would coincidentally produce the
    // same trayKey as the bidding pickup and correctly stay still — that's not what this test
    // is checking.)
    const nextView = makeView({
      phase: 'dealer_exchange',
      ownBlindHand: CARDS,
      actingHand: { player: HUMAN, role: 'blind' },
    });
    rerender(
      <HandTray
        view={nextView}
        legal={[{ type: 'DEALER_DISCARD', card: CARDS[0]! }]}
        play={vi.fn()}
      />,
    );
    expect(rafSpy).toHaveBeenCalledTimes(2);
  });

  it('re-rendering with the SAME acting hand does not re-trigger the pickup animation', () => {
    const activeView = makeView({
      phase: 'play',
      actingHand: { player: HUMAN, role: 'selected' },
    });
    const legal = [{ type: 'PLAY_CARD' as const, card: CARDS[0]! }];
    const { rerender } = render(<HandTray view={activeView} legal={legal} play={vi.fn()} />);
    expect(rafSpy).toHaveBeenCalledTimes(1);

    // Same acting hand, only `frozen` changed (e.g. a completed trick landing) — same trayKey,
    // so the tray must stay put rather than replaying the pickup motion.
    rerender(<HandTray view={activeView} legal={legal} play={vi.fn()} frozen />);
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });
});

/** The tray's label used to be computed with no reference to `frozen`, so for the whole
 *  ~1.3s trick hold it read "Your turn — play a card" while every card below it was
 *  disabled — instructing an action at the exact moment input was being refused, which reads
 *  as the game having dropped your click. Pinned here rather than in the browser because the
 *  defect only exists inside a ~1.3s window that a live driver catches unreliably. */
describe('HandTray label never prompts an action it is refusing (2i.1)', () => {
  const playing = () =>
    makeView({
      phase: 'play',
      actingHand: { player: HUMAN, role: 'selected' },
    });
  const legal = [{ type: 'PLAY_CARD' as const, card: CARDS[0]! }];

  it('prompts normally when play is actually accepted', () => {
    const { container } = render(<HandTray view={playing()} legal={legal} play={vi.fn()} />);
    expect(container.querySelector('.hand-tray-label')?.textContent).toMatch(/your turn/i);
    expect(container.querySelectorAll('.card-face:not([disabled])').length).toBeGreaterThan(0);
  });

  it('does NOT prompt while frozen — and every card really is disabled then', () => {
    const { container } = render(<HandTray view={playing()} legal={legal} play={vi.fn()} frozen />);
    const label = container.querySelector('.hand-tray-label')?.textContent ?? '';
    const total = container.querySelectorAll('.card-face').length;
    const enabled = container.querySelectorAll('.card-face:not([disabled])').length;

    // The precondition the old label was lying about.
    expect(total).toBeGreaterThan(0);
    expect(enabled).toBe(0);
    // The fix: no action prompt while nothing is actionable.
    expect(label).not.toMatch(/your turn|choose a card/i);
    expect(label.trim()).not.toBe('');
  });

  it('still labels the discard step correctly when not frozen', () => {
    const view = makeView({ phase: 'dealer_exchange', actingHand: { player: HUMAN, role: 'selected' } });
    const discard = [{ type: 'DEALER_DISCARD' as const, card: CARDS[0]! }];
    const { container } = render(<HandTray view={view} legal={discard} play={vi.fn()} />);
    expect(container.querySelector('.hand-tray-label')?.textContent).toMatch(/discard/i);
  });
});
