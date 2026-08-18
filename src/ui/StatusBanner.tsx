import type { PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';
import { Card, CardBack } from './Card.tsx';

const SUIT_LABEL: Record<string, string> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
};

export function StatusBanner({ view }: { view: PlayerView }) {
  if (view.phase === 'game_over') {
    const message = view.winner === HUMAN ? 'You win the game!' : 'Old-Timer wins the game.';
    return <div className="status-banner big">{message}</div>;
  }
  if (view.phase === 'hand_complete') {
    return <div className="status-banner">Hand complete — dealing next hand…</div>;
  }
  if (view.phase === 'misdeal') {
    return <div className="status-banner">Misdeal — redealing…</div>;
  }

  return (
    <div className="status-banner">
      <div className="status-row">
        <span>Upcard:</span>
        {view.upcard ? <Card card={view.upcard} /> : <CardBack />}
        {view.turnedDownSuit && <span>(turned down: {SUIT_LABEL[view.turnedDownSuit]})</span>}
      </div>
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
