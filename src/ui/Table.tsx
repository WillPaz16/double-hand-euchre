import type { HandId, PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';
import type { CompletedTrick } from '../game/useGame.ts';
import { Card, CardBack } from './Card.tsx';

/** The winning card is highlighted for this long before everything sweeps away.
 *
 *  COUPLED TO `TRICK_HOLD_MS` in useGame.ts — change one and you must change the other:
 *      hold/pop   0 .. 620ms      (this constant)
 *      sweep    620 .. 1240ms     (620ms CSS animation, started by this delay)
 *      state clears at 1300ms     (TRICK_HOLD_MS)
 *  If TRICK_HOLD_MS lands before the sweep finishes, cards pop out mid-flight; if it lands
 *  much later, they sit invisible at the swept-away end state (the sweep ends at opacity 0
 *  with fill-mode both) while play stays frozen. Both failure modes were observed while
 *  tuning this. */
const TRICK_HOLD_BEFORE_SWEEP_MS = 620;

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

export function Table({ view, completedTrick }: { view: PlayerView; completedTrick: CompletedTrick | null }) {
  // A finished trick is held by useGame and shown here after the engine has moved on —
  // otherwise the trick-winning card is never rendered at all. Sweeping toward the winner
  // also tells the player who took it without any extra text.
  const trick = completedTrick ? completedTrick.cards : view.currentTrick;
  const sweeping = completedTrick !== null;
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
        {trick.length === 0 && <div className="trick-empty">— trick in progress —</div>}
        {trick.map((played, i) => (
          <div
            key={i}
            className={
              'trick-card' +
              (sweeping
                ? ` is-sweeping sweep-${completedTrick.winner === HUMAN ? 'down' : 'up'}` +
                  (i === completedTrick.winningIndex ? ' is-winner' : '')
                : '')
            }
            style={sweeping ? { animationDelay: `${TRICK_HOLD_BEFORE_SWEEP_MS}ms` } : undefined}
          >
            <div className="trick-card-label">{seatLabel(played.handId)}</div>
            <Card card={played.card} />
          </div>
        ))}
      </div>
    </div>
  );
}
