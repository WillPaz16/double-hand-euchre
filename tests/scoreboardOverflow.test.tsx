/** @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../shared/engine/types.ts';
import { Scoreboard } from '../src/ui/Scoreboard.tsx';

function viewAt(a: number, b: number): PlayerView {
  return {
    you: 'A', phase: 'play', dealer: 'B', gameScore: { A: a, B: b }, winner: null,
    ownSelectedHand: [], ownBlindHand: null, opponentSelectedCount: 5, opponentBlindCount: 5,
    opponentSelectedHand: null, opponentBlindHand: null, upcard: null, turnedDownSuit: null,
    trump: null, maker: null, loner: false, currentTrick: [], tricksWon: { A: 0, B: 0 },
    trickNumber: 0, handsPlayed: 0,
  } as unknown as PlayerView;
}

/** The scoreboard shows the score as exposed pips across a 4 and a 6 — ten pips, ten points.
 *  Nothing clamps the SCORE to ten, though: points land in 1/2/4/6/8 lumps, so winning from 7
 *  with a full-blind loner puts you on 15. The renderer indexes its keyframe table by
 *  `score - 6`, which past 10 is simply undefined, and reading `.dx` off undefined throws — the
 *  scoreboard takes the whole screen down at the exact moment someone wins. */
describe('the scoreboard survives a score past ten', () => {
  it('renders every reachable score without throwing', () => {
    for (let score = 0; score <= 18; score++) {
      expect(() => render(<Scoreboard view={viewAt(score, 0)} />), `score ${score}`).not.toThrow();
    }
  });

  it('renders the specific overshoot a winning loner produces', () => {
    // 7 on the board, then a full-blind loner march at 8.
    expect(() => render(<Scoreboard view={viewAt(15, 3)} />)).not.toThrow();
  });
});
