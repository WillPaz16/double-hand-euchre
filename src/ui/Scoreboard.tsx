import type { PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';

export function Scoreboard({ view }: { view: PlayerView }) {
  return (
    <div className="scoreboard">
      <div className={view.dealer === HUMAN ? 'is-dealer' : ''}>You: {view.gameScore[HUMAN]}</div>
      <div className={view.dealer === BOT ? 'is-dealer' : ''}>
        Old-Timer: {view.gameScore[BOT]}
      </div>
    </div>
  );
}
