import type { Player, PlayerView, Suit } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';

// Each player's scoring suit — a fixed choice for now (real euchre lets a player pick their
// own suit for this; that becomes a settings option later, not part of the core rules).
const SCORE_SUIT: Record<Player, Suit> = { A: 'hearts', B: 'spades' };
const GAME_TARGET = 10;

/** The real euchre 4-and-6 scoring ritual: the score is the SUM OF EXPOSED PIPS across a
 *  4-card and a 6-card, each with a real card-back COVERING it, like the reference photos —
 *  and direct user feedback ("the amount of pips showing is the number of points") makes that
 *  literal: every single point, including odd ones, must change how many pips are visible.
 *
 *  Pips sit in the traditional 2-column grid (a real card's actual layout: see
 *  public/art/scoreboard/*.png — e.g. the 4 is 2 rows of 2), and the cover reveals them in
 *  READING ORDER — left-to-right within a row, top row before the next — via a `clip-path`
 *  polygon that stops at the row's midpoint on an odd `revealed` count. This is a SOLID
 *  region, same card-back art, just L-shaped instead of a plain rectangle — not the abstract
 *  wipe/dissolve that "peeling" complaints were actually about; a straight-edged polygon reads
 *  exactly as physical as a rectangular one. An earlier pass here swapped this for a
 *  `translateY` slide on the (mistaken) belief that clip-path itself was the "peeling" problem,
 *  which regressed odd scores back to looking identical to the even one below them (1 point
 *  and 0 points both showed zero pips) — restoring the original mechanic, not inventing a new
 *  one.
 *
 *  MUST MATCH art/generate_art.py's SCORE_PIP_Y0/Y1/SCORE_CARD_H exactly — those constants
 *  place the pip rows, and this reproduces the same boundaries to compute the cover's
 *  clip-path, so a change to one without the other misaligns the reveal with the row it's
 *  meant to stop between. Same cross-file coupling pattern as TRICK_HOLD_MS (useGame.ts /
 *  Table.tsx). Exported so tests/scoreboardGeometry.test.ts can check this against the
 *  generator's own emitted values (art/scoreboard-geometry.generated.json) instead of the two
 *  files drifting apart with nothing to notice (2h.2). */
export const CARD_H = 84;
export const PIP_Y0 = 6;
export const PIP_Y1 = 78;

/** The still-covered region, as a `clip-path` polygon on the (full-card-sized) cover element.
 *  Full rows below the current one stay entirely covered; if `revealed` is odd, the right
 *  pip of the current row does too — the left one has already been counted.
 *  Exported for tests/scoreboard.test.tsx — cheaper and more precise to assert on the actual
 *  polygon string than to parse computed styles out of jsdom, which doesn't run layout at all. */
export function coveredClipPath(revealed: number, rows: number): string {
  const rowH = (PIP_Y1 - PIP_Y0) / rows;
  const fullRows = Math.floor(revealed / 2);
  const rightPipStillCovered = revealed % 2 === 1;
  const toPct = (y: number) => `${(100 * y) / CARD_H}%`;
  const rowTop = toPct(PIP_Y0 + fullRows * rowH);

  if (rightPipStillCovered) {
    const rowBottom = toPct(PIP_Y0 + (fullRows + 1) * rowH);
    return (
      `polygon(50% ${rowTop}, 100% ${rowTop}, 100% 100%, 0% 100%, ` +
      `0% ${rowBottom}, 50% ${rowBottom})`
    );
  }
  return `polygon(0% ${rowTop}, 100% ${rowTop}, 100% 100%, 0% 100%)`;
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
      <div className="score-card-cover" style={{ clipPath: coveredClipPath(revealed, rows) }} />
    </div>
  );
}

/** Score 0-10, split across the two cards per the ritual above: the 4 carries 0-4, the 6
 *  carries the remainder once the 4 is full.
 *
 *  ONE STACK, not two side-by-side cards — direct user feedback that the earlier side-by-side
 *  layout read as two separate widgets rather than "one card overlapping another" (the whole
 *  point of the original reference photos). Only one card is ever ACTIVE (face-up, its own
 *  pips sliding into view via `ScoreCard`'s existing cover mechanic, untouched below): the 4
 *  for score 0-4, the 6 for score 5-10. The other card sits BEHIND it, peeking out at an angle
 *  — showing its plain back if it hasn't started yet (the 6, before score 5), or its own fully
 *  revealed face if it's already done (the 4, from score 5 on: it finished at 4/4 the moment
 *  the 6 took over, so there's nothing left to cover). */
function ScorePair({ player, score }: { player: Player; score: number }) {
  const suit = SCORE_SUIT[player];
  const fourActive = score <= 4;
  const activeRevealed = fourActive ? Math.min(score, 4) : Math.max(0, Math.min(score - 4, GAME_TARGET - 4));
  const activeCount = fourActive ? 4 : GAME_TARGET - 4;
  return (
    <div className="score-pair">
      {fourActive ? (
        <img className="score-card-behind" src="/art/score_card_back.png" alt="" />
      ) : (
        <img className="score-card-behind" src={`/art/scoreboard/${suit}_4.png`} alt="" />
      )}
      <ScoreCard suit={suit} rank={fourActive ? '4' : '6'} revealed={activeRevealed} count={activeCount} />
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
