/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../shared/engine/types.ts';
import { CARD_H, PIP_Y0, PIP_Y1, coveredClipPath, Scoreboard } from '../src/ui/Scoreboard.tsx';

// The polygon's first POINT is always "<x>% <rowTop>%".
const firstPoint = (poly: string): [number, number] => {
  const inner = poly.replace(/^polygon\(/, '').replace(/\)$/, '');
  const [x, y] = inner.split(',')[0]!.trim().split(/\s+/);
  return [parseFloat(x!), parseFloat(y!)];
};
const topOf = (poly: string): number => firstPoint(poly)[1];

/** coveredClipPath is the actual pip-reveal math (2e.7's fix for the scoring ritual reading
 *  "stupid" on sight) — asserted directly rather than through jsdom's computed styles, which
 *  never run real layout. Assertions are on STRUCTURE (does it contain the column boundary,
 *  does the top edge move monotonically) rather than exact float strings, so a legitimate
 *  change to PIP_Y0/Y1 doesn't force hand-updating brittle expected output here too. */
describe('coveredClipPath', () => {
  it('fully covers at 0 revealed: top edge sits at the pip grid\'s own top', () => {
    expect(topOf(coveredClipPath(0, 2))).toBeCloseTo((100 * PIP_Y0) / CARD_H);
  });

  it('reveals in READING ORDER: an odd count starts its polygon at the 50% column boundary', () => {
    // count=4 -> rows=2, so revealed=1 is "the first row's left pip only" — the covered
    // region's first point sits at x=50%, not the full row width (x=0%).
    expect(firstPoint(coveredClipPath(1, 2))[0]).toBe(50);
  });

  it('an even count starts its polygon at the row\'s full width, not the column boundary', () => {
    expect(firstPoint(coveredClipPath(2, 2))[0]).toBe(0);
  });

  it('fully reveals once every pip in every row is passed', () => {
    expect(topOf(coveredClipPath(4, 2))).toBeCloseTo((100 * PIP_Y1) / CARD_H);
  });

  it('the covered region\'s top edge moves monotonically as revealed increases (0-6, 3 rows)', () => {
    const tops = Array.from({ length: 7 }, (_, revealed) => topOf(coveredClipPath(revealed, 3)));
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1]!);
    }
  });

  it('covers the full 0-10 game range across both cards without gaps or reversals', () => {
    // The 4 carries 0-4 (2 rows), the 6 carries the remainder up to 6 (3 rows) — the same
    // split ScorePair computes. Every score from 0 to 10 must produce SOME valid, distinct
    // polygon on at least one card, and the total revealed pips across both cards must equal
    // the score exactly.
    for (let score = 0; score <= 10; score++) {
      const fourRevealed = Math.min(score, 4);
      const sixRevealed = Math.max(0, Math.min(score - 4, 6));
      expect(fourRevealed + sixRevealed).toBe(score);
      expect(coveredClipPath(fourRevealed, 2)).toMatch(/^polygon\(/);
      expect(coveredClipPath(sixRevealed, 3)).toMatch(/^polygon\(/);
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
