import type { Card as CardType, HandId, PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';
import type { CompletedTrick } from '../game/useGame.ts';
import { Card, CardBack } from './Card.tsx';
import { UpcardWheel } from './UpcardWheel.tsx';
import { useUpcardReveal } from '../game/useUpcardReveal.ts';

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

type Seat = 'sw' | 'se' | 'nw' | 'ne';

/** Seating (Phase 2e.4, revised from the round-table 2e version).
 *
 *  Two-sided: you and your two hands sit south, the Old-Timer and his two hands sit north —
 *  "opponent across from me, both my hands in front of me, both of theirs in front of them."
 *  The earlier round-table layout instead seated hands A/B/A/B around the rim so each
 *  player's own two hands faced each other as PARTNERS would in real 4-handed euchre. That
 *  was a faithful model of the underlying 4-seat game, but it isn't how the two of you
 *  actually sit at a table together, and it's a two-PLAYER game before it's a 4-hand
 *  abstraction — the seating should show the two of you, not the four seats.
 *
 *  Known tradeoff: the play ring (RULES.md §6) is fixed —
 *  `non-dealer selected -> dealer selected -> non-dealer blind -> dealer blind` — and does
 *  not change with seating. Under two-sided seating that ring zig-zags between north and
 *  south instead of walking round a rim, so turn order is no longer readable from position
 *  alone. The `.acting` highlight is load-bearing here, not decorative. */
const SEATS: { hand: HandId; at: Seat }[] = [
  { hand: { player: HUMAN, role: 'selected' }, at: 'sw' },
  { hand: { player: HUMAN, role: 'blind' }, at: 'se' },
  { hand: { player: BOT, role: 'selected' }, at: 'nw' },
  { hand: { player: BOT, role: 'blind' }, at: 'ne' },
];

function sameHand(a: HandId, b: HandId): boolean {
  return a.player === b.player && a.role === b.role;
}

function seatOf(hand: HandId): Seat {
  return SEATS.find((s) => sameHand(s.hand, hand))?.at ?? 'nw';
}

/** The hand's own cards, if this player is currently allowed to see them face-up on the
 *  table — null if they should stay as anonymous backs.
 *
 *  For your OWN hands this mirrors `redact()`: `ownSelectedHand` once the selection windows
 *  resolve, `ownBlindHand` only once it becomes the acting hand for the first time (RULES.md
 *  §6 — a hand is only ever visible to its owner while it's on the clock, or afterward via
 *  the reveal below). For the Old-Timer's hands this is null all through bidding and play —
 *  `opponentSelectedHand`/`opponentBlindHand` only populate at hand_complete/game_over, which
 *  is exactly RULES.md §8's "blind hand revealed to both players at the end of each deal."
 *  Reusing those same view fields means the table simply falls out already correct at that
 *  point: every seat shows real cards with no extra logic here. */
function visibleCards(view: PlayerView, hand: HandId): CardType[] | null {
  if (hand.player === HUMAN) {
    return hand.role === 'selected' ? view.ownSelectedHand : view.ownBlindHand;
  }
  return hand.role === 'selected' ? view.opponentSelectedHand : view.opponentBlindHand;
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

/** The rim marker's label. "Old-Timer — Hand 1" wraps to four lines in a chip a few
 *  characters wide, and the seat's position already says whose hand it is. */
function shortSeatLabel(hand: HandId): string {
  return hand.role === 'selected' ? 'H1' : 'H2';
}

/** Phases in which the turned card is still live information. Once trump is settled the
 *  upcard is buried under the deck at a real table, and it stops being worth screen space —
 *  which conveniently also means the kitty and a played trick never contend for the same
 *  felt. Keeping it visible all hand was what forced the two to overlap. */
const KITTY_PHASES = new Set([
  'select',
  'loner_full_blind',
  'loner_blind_hand',
  'bidding_round1',
  'bidding_round2',
  'dealer_exchange',
]);

export function Table({
  view,
  completedTrick,
}: {
  view: PlayerView;
  completedTrick: CompletedTrick | null;
}) {
  // A finished trick is held by useGame and shown here after the engine has moved on —
  // otherwise the trick-winning card is never rendered at all. Sweeping toward the winner
  // also tells the player who took it without any extra text.
  const trick = completedTrick ? completedTrick.cards : view.currentTrick;
  const sweeping = completedTrick !== null;
  const wheelSpinning = useUpcardReveal(view);

  return (
    <div className="table-area">
      {SEATS.map(({ hand, at }) => {
        const acting = view.actingHand ? sameHand(view.actingHand, hand) : false;
        const count = remainingInHand(view, hand);
        return (
          <div
            key={`${hand.player}-${hand.role}`}
            className={`seat seat-${at}${acting ? ' acting' : ''}`}
            // Read by HandTray's pickup animation (2e.5) to find where a hand's fan sits
            // on the table, so the tray can animate FROM that position rather than just
            // appearing. A plain DOM query rather than a ref prop-drilled through Game.tsx —
            // Table and HandTray are siblings with no natural parent to own the ref, and
            // this keeps the animation entirely HandTray's concern.
            data-seat={`${hand.player}-${hand.role}`}
          >
            <div className="seat-label">{seatLabel(hand)}</div>
            <div className="seat-label-short">{shortSeatLabel(hand)}</div>
            {/* An acting hand has been PICKED UP — its faces are in the tray below, so its
                seat is empty. Showing backs at the seat while the same cards sit face-up in
                the tray drew the hand twice and let the two disagree: the seat kept five
                backs while the tray showed four faces, because one counts what is left after
                this trick's card and the other counts what is left now. The seat is where a
                hand rests; the tray is where you have picked it up. */}
            <div className={`seat-fan${acting ? ' is-empty' : ''}`} data-count={count}>
              {acting
                ? null
                : (() => {
                    // Once a hand's contents are visible, show it face-up ON THE TABLE —
                    // "I want the hands to be on the table" — rather than an anonymous fan of
                    // backs. Only ever the exact cards remaining, so a hand shrinks correctly
                    // as it's played down; visibleCards() is null for anything not currently
                    // allowed to be seen, which keeps every information-hiding rule in
                    // RULES.md exactly as strict as it already was.
                    const cards = visibleCards(view, hand);
                    if (cards) {
                      return cards.map((card, i) => <Card key={i} card={card} />);
                    }
                    return Array.from({ length: count }).map((_, i) => <CardBack key={i} />);
                  })()}
            </div>
            {/* The same information as the fan, as a numeral. Hidden everywhere except lean
                mode, where four fans plus the felt plus the tray genuinely do not fit in
                375px of height. How many cards a hand has left is real strategic
                information, so lean mode drops the PICTURE of the hand, never the fact. */}
            <div className="seat-count">{acting ? '—' : count}</div>
          </div>
        );
      })}

      <div className="table-top">
        {/* The kitty, with the turned card on top. This used to live in the status banner
            above the table, where a 100x140 card floating on the cabin wall was both the
            single largest consumer of vertical space and a lie about what it is: the upcard
            is an object lying on the table. Moving it here freed roughly a third of the
            height the felt now occupies, and it costs no explanation at all — a card sitting
            on the baize next to the deck reads as the upcard without a caption. */}
        {view.upcard && KITTY_PHASES.has(view.phase) && (
          <div className="table-kitty">
            <CardBack />
            {/* The one genuinely random reveal in the game gets a randomizer animation; naming
                trump later gets a firm stamp instead, since a wheel would misrepresent a
                choice as chance (Phase 2 design spec §8). */}
            {wheelSpinning ? (
              <UpcardWheel suit={view.upcard.suit} durationMs={500} />
            ) : (
              <Card card={view.upcard} className="kitty-upcard" />
            )}
          </div>
        )}

        <div className="table-trick">
          {/* Only during play — otherwise it printed "trick in progress" underneath the
              bidding kitty, describing something that had not started yet. */}
          {trick.length === 0 && view.phase === 'play' && (
            <div className="trick-empty">— trick in progress —</div>
          )}
          {/* A played card sits on ITS OWN SEAT'S side of the centre, so the table shows who
              played what by position. The old layout put all four in a left-to-right row with
              a text label under each, which is strictly more to read and less to see. */}
          {trick.map((played, i) => (
            <div
              key={i}
              className={
                `trick-card at-${seatOf(played.handId)}` +
                (sweeping
                  ? ` is-sweeping sweep-${completedTrick.winner === HUMAN ? 'down' : 'up'}` +
                    (i === completedTrick.winningIndex ? ' is-winner' : '')
                  : '')
              }
              style={sweeping ? { animationDelay: `${TRICK_HOLD_BEFORE_SWEEP_MS}ms` } : undefined}
            >
              <Card card={played.card} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
