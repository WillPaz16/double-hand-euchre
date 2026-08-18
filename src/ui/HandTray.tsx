import type { Action, PlayerView } from '../../shared/engine/types.ts';
import { Card } from './Card.tsx';

/** The tray always shows whichever of the human's hands is currently on the clock, in one
 *  consistent thumb-reachable spot — regardless of which seat that hand actually belongs to.
 *  `legal` is already scoped to the human player, so a non-empty card list here means it's
 *  genuinely their turn. */
export function HandTray({
  view,
  legal,
  play,
}: {
  view: PlayerView;
  legal: Action[];
  play: (a: Action) => void;
}) {
  const cardActions = legal.filter(
    (a): a is Extract<Action, { type: 'PLAY_CARD' | 'DEALER_DISCARD' }> =>
      a.type === 'PLAY_CARD' || a.type === 'DEALER_DISCARD',
  );
  if (cardActions.length === 0) return null;

  const label =
    view.phase === 'dealer_exchange' ? 'Choose a card to discard' : 'Your turn — play a card';

  return (
    <div className="hand-tray">
      <div className="hand-tray-label">{label}</div>
      <div className="hand-tray-cards">
        {cardActions.map((a, i) => (
          <Card key={i} card={a.card} onClick={() => play(a)} highlighted />
        ))}
      </div>
    </div>
  );
}
