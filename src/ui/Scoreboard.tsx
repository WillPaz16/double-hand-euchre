import type { Player, PlayerView, Suit } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';

// Each player's scoring suit — a fixed choice for now (real euchre lets a player pick their
// own suit for this; that becomes a settings option later, not part of the core rules).
const SCORE_SUIT: Record<Player, Suit> = { A: 'hearts', B: 'spades' };
const GAME_TARGET = 10;

/** The real euchre 4-and-6 scoring ritual: the score is the SUM OF EXPOSED PIPS across a
 *  4-card and a 6-card, each with a real card-back COVERING it, like the reference photos —
 *  not a generic "reveal" abstraction. The cover is a physical card that SLIDES DOWN as the
 *  score rises, overlapping less and less of the card underneath — not a mask wiping across
 *  a static image (that read as "peeling", direct user feedback: "i dont want to peel back
 *  the card, i want one card to overlap the other").
 *
 *  Pips sit in the traditional 2-column grid (a real card's actual layout: see
 *  public/art/scoreboard/*.png — e.g. the 4 is 2 rows of 2). A solid sliding cover can only
 *  expose a straight horizontal band, so it reveals a full ROW at a time — it cannot bare one
 *  pip of a row while leaving its neighbor covered, the way the old clip-path mask could. An
 *  odd `revealed` count (mid-row) rounds DOWN: the row stays covered until both its pips are
 *  scored, `Math.floor(revealed / 2)` full rows exposed. The numeral next to each card is
 *  still what disambiguates the exact score at a glance.
 *
 *  MUST MATCH art/generate_art.py's SCORE_PIP_Y0/Y1/SCORE_CARD_H exactly — those constants
 *  place the pip rows, and this reproduces the same boundaries to compute how far the cover
 *  slides, so a change to one without the other misaligns the reveal with the row it's meant
 *  to stop between. Same cross-file coupling pattern as TRICK_HOLD_MS (useGame.ts /
 *  Table.tsx). Exported so tests/scoreboardGeometry.test.ts can check this against the
 *  generator's own emitted values (art/scoreboard-geometry.generated.json) instead of the two
 *  files drifting apart with nothing to notice (2h.2). */
export const CARD_H = 84;
export const PIP_Y0 = 6;
export const PIP_Y1 = 78;

/** How far down the cover card slides, as a `translateY` percentage of its own (full-card)
 *  height, so its top edge sits at the top of the first row that isn't yet fully revealed.
 *  0% at `revealed === 0` (fully covered); the percentage for `revealed === rows * 2` lands
 *  the top edge exactly at PIP_Y1 (fully revealed, same bottom margin the old clip-path left
 *  covered below the last row).
 *  Exported for tests/scoreboard.test.tsx — cheaper and more precise to assert on this number
 *  directly than to parse computed styles out of jsdom, which doesn't run layout at all. */
export function coverOffsetPct(revealed: number, rows: number): number {
  const rowH = (PIP_Y1 - PIP_Y0) / rows;
  const fullRows = Math.floor(revealed / 2);
  return (100 * (PIP_Y0 + fullRows * rowH)) / CARD_H;
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
  const rows = count / 2;
  return (
    <div className="score-card-slot">
      <img className="score-card-pips" src={`/art/scoreboard/${suit}_${rank}.png`} alt="" />
      <div
        className="score-card-cover"
        style={{ transform: `translateY(${coverOffsetPct(revealed, rows)}%)` }}
      />
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

/** No portrait here any more. It was the Old-Timer's face in the corner of the scoreboard,
 *  which made sense while he was absent from the table — but he now sits across it (2f.3,
 *  Table.tsx), reacting with the same `useOpponentExpression` states, so the portrait was
 *  literally a second copy of the same man on the same screen. */
export function Scoreboard({ view }: { view: PlayerView }) {
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

      </div>
    </div>
  );
}
