/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../shared/engine/types.ts';
import { CARD_H, PIP_Y0, PIP_Y1, coverOffsetPct, Scoreboard } from '../src/ui/Scoreboard.tsx';

/** coverOffsetPct is the actual reveal math for the sliding cover card (2e.7 fixed the
 *  scoring ritual reading "stupid" on sight; a later pass replaced its clip-path "peel" with
 *  this physical slide per direct user feedback — "i want one card to overlap the other").
 *  Asserted directly as a number rather than through jsdom's computed styles, which never run
 *  real layout. */
describe('coverOffsetPct', () => {
  it('fully covers at 0 revealed: offset sits at the pip grid\'s own top', () => {
    expect(coverOffsetPct(0, 2)).toBeCloseTo((100 * PIP_Y0) / CARD_H);
  });

  it('a straight slide reveals a full row at a time: an odd count does not move the offset yet', () => {
    // count=4 -> rows=2. revealed=1 is "one pip of the first row" — a solid cover can't bare
    // one pip while covering its row-mate, so the offset stays wherever revealed=0 left it
    // until the row's second pip is scored.
    expect(coverOffsetPct(1, 2)).toBe(coverOffsetPct(0, 2));
  });

  it('the second pip of a row slides the cover past that row', () => {
    expect(coverOffsetPct(2, 2)).toBeGreaterThan(coverOffsetPct(1, 2));
  });

  it('fully reveals once every pip in every row is passed', () => {
    expect(coverOffsetPct(4, 2)).toBeCloseTo((100 * PIP_Y1) / CARD_H);
  });

  it('the offset moves monotonically as revealed increases (0-6, 3 rows)', () => {
    const offsets = Array.from({ length: 7 }, (_, revealed) => coverOffsetPct(revealed, 3));
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]!);
    }
  });

  it('covers the full 0-10 game range across both cards without gaps or reversals', () => {
    // The 4 carries 0-4 (2 rows), the 6 carries the remainder up to 6 (3 rows) — the same
    // split ScorePair computes. Every score from 0 to 10 must produce a valid in-range offset
    // on both cards, and the total revealed pips across both cards must equal the score
    // exactly (the pip ACCOUNTING is exact even though the cover's slide rounds to whole rows).
    for (let score = 0; score <= 10; score++) {
      const fourRevealed = Math.min(score, 4);
      const sixRevealed = Math.max(0, Math.min(score - 4, 6));
      expect(fourRevealed + sixRevealed).toBe(score);
      const fourOffset = coverOffsetPct(fourRevealed, 2);
      const sixOffset = coverOffsetPct(sixRevealed, 3);
      expect(fourOffset).toBeGreaterThanOrEqual((100 * PIP_Y0) / CARD_H);
      expect(fourOffset).toBeLessThanOrEqual((100 * PIP_Y1) / CARD_H);
      expect(sixOffset).toBeGreaterThanOrEqual((100 * PIP_Y0) / CARD_H);
      expect(sixOffset).toBeLessThanOrEqual((100 * PIP_Y1) / CARD_H);
    }
  });
});

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
});
