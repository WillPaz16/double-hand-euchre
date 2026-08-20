import type { Player, PlayerView, Suit } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';
import { useOpponentExpression } from '../game/useOpponentExpression.ts';

// Each player's scoring suit — a fixed choice for now (real euchre lets a player pick their
// own suit for this; that becomes a settings option later, not part of the core rules).
const SCORE_SUIT: Record<Player, Suit> = { A: 'hearts', B: 'spades' };
const GAME_TARGET = 10;

/** The real euchre 4-and-6 scoring ritual (Phase 2e.6): the score is the SUM OF EXPOSED PIPS
 *  across a 4-card and a 6-card, each hidden behind a sliding cover. You raise the 4 to show
 *  1-4, then once it reads a full 4 you start raising the 6 to carry 5-10.
 *
 *  MUST MATCH art/generate_art.py's SCORE_PIP_Y0/Y1 and SCORE_CARD_H exactly — those constants
 *  place the pips, and this reproduces the same boundary formula to size the cover, so a
 *  change to one without the other misaligns the reveal with the pip centres it's meant to
 *  land between. Same cross-file coupling pattern as TRICK_HOLD_MS (useGame.ts / Table.tsx). */
const CARD_H = 84;
const PIP_Y0 = 6;
const PIP_Y1 = 78;

/** % of the card height still covered once `revealed` of `count` pips are showing. Covers the
 *  BOTTOM of the card (see the CSS: the cover div is bottom-anchored), so pips reveal from the
 *  top down as the score rises — matching the boundary each pip was centred against in the
 *  generator, so the cover's edge always lands in the gap between two pips, never mid-pip. */
function coverPct(revealed: number, count: number): number {
  const boundaryY = PIP_Y0 + (revealed / count) * (PIP_Y1 - PIP_Y0);
  return (100 * (CARD_H - boundaryY)) / CARD_H;
}

function ScoreCard({
  suit,
  rank,
  revealed,
  count,
}: {
  suit: Suit;
  rank: '4' | '6';
  revealed: number;
  count: number;
}) {
  return (
    <div className="score-card-slot">
      <img className="score-card-pips" src={`/art/scoreboard/${suit}_${rank}.png`} alt="" />
      <div className="score-card-cover" style={{ height: `${coverPct(revealed, count)}%` }}>
        <div className="score-card-cover-art" />
      </div>
    </div>
  );
}

/** Score 0-10, split across the two cards per the ritual above: the 4 carries 0-4, the 6
 *  carries the remainder once the 4 is full. */
function ScorePair({ player, score }: { player: Player; score: number }) {
  const suit = SCORE_SUIT[player];
  const fourRevealed = Math.min(score, 4);
  const sixRevealed = Math.max(0, Math.min(score - 4, GAME_TARGET - 4));
  return (
    <div className="score-pair">
      <ScoreCard suit={suit} rank="4" revealed={fourRevealed} count={4} />
      <ScoreCard suit={suit} rank="6" revealed={sixRevealed} count={GAME_TARGET - 4} />
    </div>
  );
}

export function Scoreboard({ view }: { view: PlayerView }) {
  const expression = useOpponentExpression(view);
  return (
    <div className="scoreboard">
      <div className={`score-slot${view.dealer === HUMAN ? ' is-dealer' : ''}`}>
        <div className="score-text">
          <span className="score-label">You</span>
          <span className="score-number">{view.gameScore[HUMAN]}</span>
        </div>
        <ScorePair player={HUMAN} score={view.gameScore[HUMAN]} />
      </div>
      <div className={`score-slot${view.dealer === BOT ? ' is-dealer' : ''}`}>
        <ScorePair player={BOT} score={view.gameScore[BOT]} />
        <div className="score-text">
          <span className="score-label">Old-Timer</span>
          <span className="score-number">{view.gameScore[BOT]}</span>
        </div>
        <img
          className="opponent-portrait"
          src={`/art/portraits/old_timer_${expression}.png`}
          alt="Old-Timer"
        />
      </div>
    </div>
  );
}
