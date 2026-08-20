import type { PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';

const SUIT_LABEL: Record<string, string> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
};

export function StatusBanner({
  view,
  onRestart,
}: {
  view: PlayerView;
  onRestart?: () => void;
}) {
  if (view.phase === 'game_over') {
    const message = view.winner === HUMAN ? 'You win the game!' : 'Old-Timer wins the game.';
    return (
      <div className="status-banner big">
        <div>{message}</div>
        {onRestart && (
          <button className="bid-button" onClick={onRestart}>
            Play again
          </button>
        )}
      </div>
    );
  }
  if (view.phase === 'hand_complete') {
    return <div className="status-banner">Hand complete — dealing next hand…</div>;
  }
  if (view.phase === 'misdeal') {
    return <div className="status-banner">Misdeal — redealing…</div>;
  }

  // The upcard itself now sits on the felt (see Table.tsx) rather than floating on the wall
  // above it. What is left here is genuinely textual status, so this is one compact strip.
  return (
    <div className="status-banner">
      {view.turnedDownSuit && (
        <div className="status-row">Turned down: {SUIT_LABEL[view.turnedDownSuit]}</div>
      )}
      {view.trump && (
        <div className="status-row">
          Trump: {SUIT_LABEL[view.trump]}
          {view.maker && <> — Maker: {view.maker === HUMAN ? 'You' : 'Old-Timer'}</>}
          {view.lonerTier && ` (${view.lonerTier.replace('_', ' ')} loner)`}
        </div>
      )}
      <div className="status-row">
        Trick {view.trickNumber + 1} of 5 — Tricks won: You {view.tricksWon[HUMAN]}, Old-Timer{' '}
        {view.tricksWon[BOT]}
      </div>
    </div>
  );
}
