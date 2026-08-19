import type { Player, PlayerView, Suit } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';
import { useOpponentExpression } from '../game/useOpponentExpression.ts';

// Each player's scoring suit — a fixed choice for now (real euchre lets a player pick their
// own suit for this; that becomes a settings option later, not part of the core rules).
const SCORE_SUIT: Record<Player, Suit> = { A: 'hearts', B: 'spades' };
const GAME_TARGET = 10;

function ScorePair({ player, score }: { player: Player; score: number }) {
  const suit = SCORE_SUIT[player];
  const pct = Math.min(1, score / GAME_TARGET);
  return (
    <div className="score-pair">
      <img
        className="score-card score-card-six"
        style={{ left: `${pct * 60}px` }}
        src={`/art/scoreboard/${suit}_6.png`}
        alt=""
      />
      <img className="score-card score-card-four" src={`/art/scoreboard/${suit}_4.png`} alt="" />
    </div>
  );
}

export function Scoreboard({ view }: { view: PlayerView }) {
  const expression = useOpponentExpression(view);
  return (
    <div className="scoreboard">
      <div className={`score-slot${view.dealer === HUMAN ? ' is-dealer' : ''}`}>
        <span className="score-label">You</span>
        <ScorePair player={HUMAN} score={view.gameScore[HUMAN]} />
        <span className="score-number">{view.gameScore[HUMAN]}</span>
      </div>
      <div className={`score-slot${view.dealer === BOT ? ' is-dealer' : ''}`}>
        <img
          className="opponent-portrait"
          src={`/art/portraits/old_timer_${expression}.png`}
          alt="Old-Timer"
        />
        <span className="score-label">Old-Timer</span>
        <ScorePair player={BOT} score={view.gameScore[BOT]} />
        <span className="score-number">{view.gameScore[BOT]}</span>
      </div>
    </div>
  );
}
