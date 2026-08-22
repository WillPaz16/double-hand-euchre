/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Action, PlayerView } from '../shared/engine/types.ts';
import { HUMAN } from '../src/game/useGame.ts';
import { BidPanel } from '../src/ui/BidPanel.tsx';

// No global setup file registers RTL's auto-cleanup in this project (useGame.test.tsx and
// fullGame.test.tsx only ever use renderHook, which doesn't leave DOM behind) — this is the
// first test file in the repo to render real markup across multiple `it()`s, so it needs its
// own cleanup or `screen` queries match stale nodes from earlier tests in the same file.
afterEach(cleanup);

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: HUMAN,
    phase: 'bidding_round1',
    dealer: HUMAN,
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: null,
    ownBlindHand: null,
    opponentSelectedCount: 5,
    opponentBlindCount: 5,
    opponentSelectedHand: null,
    opponentBlindHand: null,
    upcard: { rank: 'J', suit: 'spades' },
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

describe('BidPanel', () => {
  it('renders nothing outside the bidding phases', () => {
    const { container } = render(
      <BidPanel view={makeView({ phase: 'play' })} legal={[{ type: 'PASS', player: HUMAN }]} play={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is nothing legal to do', () => {
    const { container } = render(<BidPanel view={makeView()} legal={[]} play={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('the trump-then-alone flow: calling trump stages it, "With Partner" fires the non-loner action exactly once', () => {
    const play = vi.fn();
    const legal: Action[] = [
      { type: 'ORDER_UP', player: HUMAN, loner: false },
      { type: 'ORDER_UP', player: HUMAN, loner: true },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView()} legal={legal} play={play} />);

    // Step 1: the top-level list collapses the loner:true/false pair into ONE button.
    expect(screen.getAllByRole('button', { name: 'Order It Up' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Order It Up' }));

    // Step 2: the confirm screen states the outcome as fact and offers two distinct paths —
    // never repeats "Order It Up" as a button label (the exact bug 2f.2 fixed).
    expect(screen.getByText(/spades is trump/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Order It Up' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'With Partner' }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith({ type: 'ORDER_UP', player: HUMAN, loner: false });
  });

  it('"Go Alone" from the confirm screen fires the loner action', () => {
    const play = vi.fn();
    const legal: Action[] = [
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: false },
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: true },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView({ phase: 'bidding_round2' })} legal={legal} play={play} />);
    fireEvent.click(screen.getByRole('button', { name: 'Call Hearts' }));
    fireEvent.click(screen.getByRole('button', { name: /go alone/i }));
    expect(play).toHaveBeenCalledWith({ type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: true });
  });

  it('"Back" from the trump confirm screen returns to the original choices without firing anything', () => {
    const play = vi.fn();
    const legal: Action[] = [
      { type: 'ORDER_UP', player: HUMAN, loner: false },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView()} legal={legal} play={play} />);
    fireEvent.click(screen.getByRole('button', { name: 'Order It Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Order It Up' })).toBeTruthy();
    expect(play).not.toHaveBeenCalled();
  });

  it('the full-blind loner gets its OWN deliberate confirm, distinct from the trump-alone flow', () => {
    const play = vi.fn();
    const legal: Action[] = [
      { type: 'DECLARE_FULL_BLIND_LONER', player: HUMAN },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView({ phase: 'loner_full_blind' })} legal={legal} play={play} />);
    fireEvent.click(screen.getByRole('button', { name: /go alone.*full blind/i }));
    expect(screen.getByText(/won't see your hand or the upcard/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /yes, go blind/i }));
    expect(play).toHaveBeenCalledWith({ type: 'DECLARE_FULL_BLIND_LONER', player: HUMAN });
  });

  it('a staged choice never survives a phase change — no leaking into the next bidding window', () => {
    const legal: Action[] = [
      { type: 'ORDER_UP', player: HUMAN, loner: false },
      { type: 'PASS', player: HUMAN },
    ];
    const { rerender } = render(<BidPanel view={makeView()} legal={legal} play={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Order It Up' }));
    expect(screen.getByText(/is trump/i)).toBeTruthy();

    // Phase moves on (e.g. the other player acted) — the staged trump choice must not persist.
    const nextLegal: Action[] = [{ type: 'PASS', player: HUMAN }];
    rerender(<BidPanel view={makeView({ phase: 'bidding_round2' })} legal={nextLegal} play={vi.fn()} />);
    expect(screen.queryByText(/is trump/i)).toBeNull();
  });
});
