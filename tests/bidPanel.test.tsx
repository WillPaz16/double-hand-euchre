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

  it('calling trump with partner fires the non-loner action directly, one tap, no second screen', () => {
    const play = vi.fn();
    const legal: Action[] = [
      { type: 'ORDER_UP', player: HUMAN, loner: false },
      { type: 'ORDER_UP', player: HUMAN, loner: true },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView()} legal={legal} play={play} />);

    // One row: the primary trump call plus its own "Alone" chip, both visible at once.
    expect(screen.getAllByRole('button', { name: 'Order It Up' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /alone/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Order It Up' }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith({ type: 'ORDER_UP', player: HUMAN, loner: false });
  });

  it('the "Alone" chip fires the loner action directly, one tap, no second screen', () => {
    const play = vi.fn();
    const legal: Action[] = [
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: false },
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: true },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView({ phase: 'bidding_round2' })} legal={legal} play={play} />);
    fireEvent.click(screen.getByRole('button', { name: /alone/i }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith({ type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: true });
  });

  it('round 2 shows one row per legal suit, each with its own primary + alone controls', () => {
    const legal: Action[] = [
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: false },
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'hearts', loner: true },
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'clubs', loner: false },
      { type: 'NAME_TRUMP', player: HUMAN, suit: 'clubs', loner: true },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView({ phase: 'bidding_round2' })} legal={legal} play={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Call Hearts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call Clubs' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /alone/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Pass' })).toBeTruthy();
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

  it('legal stays live across a phase change with no stale state to leak', () => {
    const legal: Action[] = [
      { type: 'ORDER_UP', player: HUMAN, loner: false },
      { type: 'PASS', player: HUMAN },
    ];
    const { rerender } = render(<BidPanel view={makeView()} legal={legal} play={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Order It Up' })).toBeTruthy();

    // Phase moves on (e.g. the other player acted) — round 1's controls must not persist.
    const nextLegal: Action[] = [{ type: 'PASS', player: HUMAN }];
    rerender(<BidPanel view={makeView({ phase: 'bidding_round2' })} legal={nextLegal} play={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Order It Up' })).toBeNull();
  });

  it('focus moves to Back on entering the full-blind confirm screen (2h.4)', () => {
    const legal: Action[] = [
      { type: 'DECLARE_FULL_BLIND_LONER', player: HUMAN },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView({ phase: 'loner_full_blind' })} legal={legal} play={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /go alone.*full blind/i }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back' }));
  });

  it('Escape backs out of the full-blind confirm screen — the one decision with no undo once made', () => {
    const play = vi.fn();
    const legal: Action[] = [
      { type: 'DECLARE_FULL_BLIND_LONER', player: HUMAN },
      { type: 'PASS', player: HUMAN },
    ];
    render(<BidPanel view={makeView({ phase: 'loner_full_blind' })} legal={legal} play={play} />);
    fireEvent.click(screen.getByRole('button', { name: /go alone.*full blind/i }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Back' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: /go alone.*full blind/i })).toBeTruthy();
    expect(play).not.toHaveBeenCalled();
  });
});
