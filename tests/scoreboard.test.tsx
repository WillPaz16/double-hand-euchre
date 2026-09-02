/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../shared/engine/types.ts';
import { Scoreboard } from '../src/ui/Scoreboard.tsx';

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: 'A',
    phase: 'play',
    dealer: 'A',
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: null,
    ownBlindHand: null,
    opponentSelectedCount: 0,
    opponentBlindCount: 0,
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

/** The two-phase scoring ritual (2n.2, replacing the earlier clip-path `coveredClipPath`
 *  mechanic): 0-6 is a back sliding off the 6, 7-10 is the spent 6 sliding off the 4 — see
 *  Scoreboard.tsx's own top-of-file comment for the full design history. Asserted here on the
 *  rendered DOM (image src + layer order) rather than on internal transform tables, since the
 *  actual contract this component owes the rest of the app is "the right two card images, in
 *  the right stacking order, for this score" — not any particular constant's name. */
describe('ScorePair phase selection', () => {
  const pairFor = (score: number) => {
    const { container } = render(
      <Scoreboard view={makeView({ gameScore: { A: score, B: 0 } })} />,
    );
    return container.querySelectorAll('.score-slot')[0]!.querySelector('.score-pair')!;
  };

  it('phase A (score < 6): the 6 is the base, a card back is the cover', () => {
    const pair = pairFor(3);
    expect(pair.querySelector('.score-card-base')?.getAttribute('src')).toBe(
      '/art/scoreboard/hearts_6.png',
    );
    expect(pair.querySelector('.score-card-cover')?.getAttribute('src')).toBe(
      '/art/score_card_back.png',
    );
  });

  it('score 0: cover sits at rest with no offset (identity transform)', () => {
    const cover = pairFor(0).querySelector('.score-card-cover') as HTMLElement;
    expect(cover.style.transform).toContain('translate(calc(0 * 30px * var(--px))');
  });

  it('score 6: the transition point — 6 is the base with no cover, 4 is arriving as the cover', () => {
    const pair = pairFor(6);
    expect(pair.querySelector('.score-card-base')?.getAttribute('src')).toBe(
      '/art/scoreboard/hearts_6.png',
    );
    expect(pair.querySelector('.score-card-cover')?.getAttribute('src')).toBe(
      '/art/scoreboard/hearts_4.png',
    );
  });

  it('phase B (score > 6): the 4 is the base, the now-spent 6 is the cover', () => {
    const pair = pairFor(9);
    expect(pair.querySelector('.score-card-base')?.getAttribute('src')).toBe(
      '/art/scoreboard/hearts_4.png',
    );
    expect(pair.querySelector('.score-card-cover')?.getAttribute('src')).toBe(
      '/art/scoreboard/hearts_6.png',
    );
  });

  it('score 10 (the win): 4 and 6 sit fully parked apart, flat', () => {
    const cover = pairFor(10).querySelector('.score-card-cover') as HTMLElement;
    expect(cover.style.transform).toContain('rotate(0deg)');
  });

  it('every score from 0 to 10 renders exactly one base and one cover image', () => {
    // Score 6 is the one case where the cover is drawn BEFORE the base in source order (the
    // arriving 4 must sit visually behind the fully-exposed 6, per ScorePair's own branch) —
    // so this only asserts presence/count, not DOM order.
    for (let score = 0; score <= 10; score++) {
      const pair = pairFor(score);
      expect(pair.querySelectorAll('.score-card-img').length).toBe(2);
      expect(pair.querySelectorAll('.score-card-base').length).toBe(1);
      expect(pair.querySelectorAll('.score-card-cover').length).toBe(1);
    }
  });
});

describe('Scoreboard', () => {
  it('renders both players\' numeric scores', () => {
    render(<Scoreboard view={makeView({ gameScore: { A: 3, B: 7 } })} />);
    const numbers = screen.getAllByText(/^\d+$/).map((el) => el.textContent);
    expect(numbers).toContain('3');
    expect(numbers).toContain('7');
  });

  it('marks the current dealer\'s slot', () => {
    const { container } = render(<Scoreboard view={makeView({ dealer: 'B' })} />);
    const dealerSlot = container.querySelector('.score-slot.is-dealer');
    expect(dealerSlot).not.toBeNull();
    expect(dealerSlot?.textContent).toContain('Old-Timer');
  });

  it('marks the winning player\'s card pair with is-won', () => {
    const { container } = render(<Scoreboard view={makeView({ winner: 'B' })} />);
    const slots = container.querySelectorAll('.score-slot');
    expect(slots[0]!.querySelector('.score-card-anchor.is-won')).toBeNull();
    expect(slots[1]!.querySelector('.score-card-anchor.is-won')).not.toBeNull();
  });
});
