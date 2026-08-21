import type { Card as CardType, HandId, PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';
import type { CompletedTrick } from '../game/useGame.ts';
import { Card, CardBack } from './Card.tsx';
import { UpcardWheel } from './UpcardWheel.tsx';
import { useUpcardReveal } from '../game/useUpcardReveal.ts';
import { useOpponentExpression } from '../game/useOpponentExpression.ts';

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

/** The hand's own cards, if this player is allowed to see them face-up ON THE TABLE right
 *  now — null if the seat must stay anonymous backs. A hand you have physically PICKED UP
 *  (see `isHeld` below) is never shown here even if visible in principle; it's in the tray
 *  instead, which is the whole point of picking it up.
 *
 *  **This enforces RULES.md §6, which a previous version broke.** The rule is: "only the hand
 *  currently taking its turn is shown to its owner ... never seeing both simultaneously." The
 *  memory strain is the game (design spec §8: "No memory aids"). When 2e.7 put hands face-up
 *  on the table it keyed off `redact()`'s `ownSelectedHand`, which stays populated for the
 *  WHOLE deal once `selectedHandsRevealed` is set at bidding — so during play your selected
 *  hand sat face-up at its seat while your blind hand was face-up in the tray, and you could
 *  read both at once. The engine was never at fault; the UI showed something it was handed
 *  and shouldn't have drawn.
 *
 *  So visibility is decided by PHASE, not merely by what redact() happens to expose:
 *    - deal over -> everything, per RULES.md §8's end-of-deal reveal
 *    - bidding / selection / play / exchange -> nothing of your own; a visible hand of yours
 *      is always the HELD one, which lives in the tray (HandTray.tsx), never at the seat. */
const DEAL_OVER_PHASES = new Set(['hand_complete', 'game_over']);
export const BIDDING_PHASES = new Set([
  'select',
  'loner_full_blind',
  'loner_blind_hand',
  'bidding_round1',
  'bidding_round2',
]);

function visibleCards(view: PlayerView, hand: HandId): CardType[] | null {
  if (DEAL_OVER_PHASES.has(view.phase)) {
    if (hand.player === HUMAN) {
      return hand.role === 'selected' ? view.ownSelectedHand : view.ownBlindHand;
    }
    return hand.role === 'selected' ? view.opponentSelectedHand : view.opponentBlindHand;
  }
  return null;
}

/** Is this hand currently PICKED UP — in the tray, not resting at its seat? Two cases:
 *    - the acting hand in play/dealer_exchange (unchanged from before)
 *    - your own SELECTED hand during bidding: "when you go to call trump, the hand you
 *      selected should come up into your hand so you can see the cards" — in real euchre you
 *      pick your cards up to look at them before bidding, you don't leave them lying on the
 *      table and squint at them from across it. Only ever the selected hand, and only ever
 *      yours: the blind hand stays face-down (you haven't looked at it yet, §2), and the
 *      Old-Timer's hand is never yours to hold regardless of phase. */
export function isHeld(view: PlayerView, hand: HandId): boolean {
  if (view.actingHand && sameHand(view.actingHand, hand)) return true;
  return (
    hand.player === HUMAN &&
    hand.role === 'selected' &&
    BIDDING_PHASES.has(view.phase) &&
    view.ownSelectedHand !== null
  );
}

/** Every active hand plays exactly one card per trick, so its remaining count is always
 *  derivable from how many tricks have completed (plus whether it's already gone this trick).
 *  No extra engine state needed for this. */
function remainingInHand(view: PlayerView, hand: HandId): number {
  const playedThisTrick = view.currentTrick.some((tc) => sameHand(tc.handId, hand));
  return Math.max(0, 5 - view.trickNumber - (playedThisTrick ? 1 : 0));
}

/** Who a seat belongs to is now shown by POSITION — your hands are in front of you, his are
 *  in front of him, and he is visibly sitting there (2f.3). So the label only has to
 *  disambiguate WHICH of the two hands it is. The full "Old-Timer — Hand 1" printed straight
 *  across his chest once he was actually on the table. */
function seatLabel(hand: HandId): string {
  return hand.role === 'selected' ? 'Hand 1' : 'Hand 2';
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
  const expression = useOpponentExpression(view);

  return (
    <div className="table-area">
      {/* The Old-Timer, ACROSS the table (2f.3). He is the first child and painted lowest, so
          the felt and his own card fans occlude his chest — which is exactly what sitting
          opposite someone looks like, and is also why the sprite only has to be head and
          shoulders. He previously lived in <SceneLayer> in the room's right margin, 538px
          and 226px from the two card fans that are supposed to be his. */}
      <img
        className="table-opponent"
        src={`/art/opponent_${expression}.png`}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {SEATS.map(({ hand, at }) => {
        // "acting" (gold highlight + turn order) and "held" (picked up, seat empty) used to
        // be the same boolean. They're related but not identical now that a hand can be held
        // during bidding, where nobody is "acting" in the RULES.md §6 turn-order sense at
        // all — highlighting a seat gold while its owner merely holds it up to bid would
        // wrongly imply it's that hand's turn to play.
        const acting = view.actingHand ? sameHand(view.actingHand, hand) : false;
        const held = isHeld(view, hand);
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
            <div className={`seat-fan${held ? ' is-empty' : ''}`} data-count={count}>
              {held
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
                    return Array.from({ length: count }).map((_, i) => <CardBack key={i} seat />);
                  })()}
            </div>
            {/* The same information as the fan, as a numeral. Hidden everywhere except lean
                mode, where four fans plus the felt plus the tray genuinely do not fit in
                375px of height. How many cards a hand has left is real strategic
                information, so lean mode drops the PICTURE of the hand, never the fact. */}
            <div className="seat-count">{held ? '—' : count}</div>
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
