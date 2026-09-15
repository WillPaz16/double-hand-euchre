/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, PlayerView } from '../shared/engine/types.ts';
import { HUMAN } from '../src/game/useGame.ts';
import { HandTray } from '../src/ui/HandTray.tsx';

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});

// Clubs trump after picking up the jack of clubs. A trump-first sort would put the picked-up
// J♣ and the A♣ at the far left and drag J♠ (the left bower) in with them.
const HELD: Card[] = [
  { rank: '9', suit: 'hearts' },
  { rank: 'A', suit: 'clubs' },
  { rank: 'J', suit: 'spades' },
  { rank: 'K', suit: 'diamonds' },
  { rank: '10', suit: 'hearts' },
];
const UPCARD: Card = { rank: 'J', suit: 'clubs' };

function view(overrides: Partial<PlayerView>): PlayerView {
  return {
    you: HUMAN, phase: 'play', dealer: HUMAN, gameScore: { A: 0, B: 0 }, winner: null,
    ownSelectedHand: HELD, ownBlindHand: null, opponentSelectedCount: 5, opponentBlindCount: 5,
    opponentSelectedHand: null, opponentBlindHand: null, upcard: null, turnedDownSuit: null,
    trump: 'clubs', maker: HUMAN, lonerTier: null, currentTrick: [], tricksWon: { A: 0, B: 0 },
    trickNumber: 1, actingHand: { player: HUMAN, role: 'selected' },
    ...overrides,
  };
}

const order = () => screen.getAllByRole('img').map((img) => img.getAttribute('alt')).filter(Boolean);

describe('hand order around the dealer discard', () => {
  it('does NOT re-sort by trump while choosing the discard; picked-up card sits on the end', () => {
    const hand = [...HELD, UPCARD];
    render(
      <HandTray
        view={view({ phase: 'dealer_exchange', ownSelectedHand: hand, upcard: UPCARD })}
        legal={hand.map((card) => ({ type: 'DEALER_DISCARD' as const, card }))}
        play={vi.fn()}
      />,
    );
    const bidOrderWithoutTrump = order().slice(0, 5);
    expect(order().at(-1)).toBe('J of clubs');
    // Same by-suit order the hand showed during bidding (no trump yet): the left bower is
    // NOT pulled next to the clubs.
    expect(bidOrderWithoutTrump.indexOf('J of spades')).not.toBe(1);
    expect(bidOrderWithoutTrump).toHaveLength(5);
  });

  it('sorts trump-first once the discard is made', () => {
    const afterDiscard = [...HELD.filter((c) => c.suit !== 'hearts' || c.rank !== '9'), UPCARD];
    render(
      <HandTray
        view={view({ ownSelectedHand: afterDiscard })}
        legal={afterDiscard.map((card) => ({ type: 'PLAY_CARD' as const, card }))}
        play={vi.fn()}
      />,
    );
    // Right bower, left bower, ace of trump, leftmost.
    expect(order().slice(0, 3)).toEqual(['J of clubs', 'J of spades', 'A of clubs']);
  });
});
