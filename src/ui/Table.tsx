import type { HandId, PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';
import { Card, CardBack } from './Card.tsx';

const SEATS: HandId[] = [
  { player: HUMAN, role: 'selected' },
  { player: BOT, role: 'selected' },
  { player: HUMAN, role: 'blind' },
  { player: BOT, role: 'blind' },
];

function sameHand(a: HandId, b: HandId): boolean {
  return a.player === b.player && a.role === b.role;
}

/** Every active hand plays exactly one card per trick, so its remaining count is always
 *  derivable from how many tricks have completed (plus whether it's already gone this trick).
 *  No extra engine state needed for this. */
function remainingInHand(view: PlayerView, hand: HandId): number {
  const playedThisTrick = view.currentTrick.some((tc) => sameHand(tc.handId, hand));
  return Math.max(0, 5 - view.trickNumber - (playedThisTrick ? 1 : 0));
}

function seatLabel(hand: HandId): string {
  const who = hand.player === HUMAN ? 'You' : 'Old-Timer';
  const which = hand.role === 'selected' ? 'Hand 1' : 'Hand 2';
  return `${who} — ${which}`;
}

export function Table({ view }: { view: PlayerView }) {
  return (
    <div className="table">
      <div className="seats">
        {SEATS.map((hand) => {
          const acting = view.actingHand ? sameHand(view.actingHand, hand) : false;
          const count = remainingInHand(view, hand);
          return (
            <div
              key={`${hand.player}-${hand.role}`}
              className={`seat${acting ? ' acting' : ''}`}
            >
              <div className="seat-label">{seatLabel(hand)}</div>
              <div className="seat-backs">
                {Array.from({ length: count }).map((_, i) => (
                  <CardBack key={i} mini />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="trick-area">
        {view.currentTrick.length === 0 && <div className="trick-empty">— trick in progress —</div>}
        {view.currentTrick.map((played, i) => (
          <div key={i} className="trick-card">
            <div className="trick-card-label">{seatLabel(played.handId)}</div>
            <Card card={played.card} />
          </div>
        ))}
      </div>
    </div>
  );
}
