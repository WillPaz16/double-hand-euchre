import type { Action, Card as CardType, PlayerView } from '../../shared/engine/types.ts';
import { Card } from './Card.tsx';

function cardsEqual(a: CardType, b: CardType): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** The tray always shows the human's whole acting hand — not just the legal subset — with
 *  legal cards glowing and the rest dimmed. Per the design spec: highlight legal plays, don't
 *  hide the rest of the hand. `legal` is already scoped to the human player, so a non-empty
 *  card-action list here means it's genuinely their turn. */
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
  if (cardActions.length === 0 || !view.actingHand) return null;

  const fullHand = view.actingHand.role === 'selected' ? view.ownSelectedHand : view.ownBlindHand;
  if (!fullHand) return null;

  const label =
    view.phase === 'dealer_exchange' ? 'Choose a card to discard' : 'Your turn — play a card';

  // Keying on the acting hand's identity forces React to remount this container whenever the
  // human switches which of their two hands is up — which is exactly when the flip should
  // replay. Same hand acting again (e.g. after going alone) keeps the same key, so it stays
  // still rather than re-flipping into itself.
  const trayKey = `${view.actingHand.player}-${view.actingHand.role}`;

  return (
    <div className="hand-tray">
      <div className="hand-tray-label">{label}</div>
      <div className="hand-tray-cards" key={trayKey}>
        {fullHand.map((card, i) => {
          const action = cardActions.find((a) => cardsEqual(a.card, card));
          return (
            <Card
              key={i}
              card={card}
              onClick={action ? () => play(action) : undefined}
              highlighted={!!action}
              dimmed={!action}
            />
          );
        })}
      </div>
    </div>
  );
}
