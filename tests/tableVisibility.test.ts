import { describe, expect, it } from 'vitest';
import type { Card, HandId, PlayerView } from '../shared/engine/types.ts';
import { HUMAN, BOT } from '../src/game/useGame.ts';
import { isHeld, visibleCards } from '../src/ui/Table.tsx';

const humanSelected: HandId = { player: HUMAN, role: 'selected' };
const humanBlind: HandId = { player: HUMAN, role: 'blind' };
const botSelected: HandId = { player: BOT, role: 'selected' };

const CARDS: Card[] = [{ rank: '9', suit: 'hearts' }];

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: HUMAN,
    phase: 'play',
    dealer: HUMAN,
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: null,
    ownBlindHand: null,
    opponentSelectedCount: 5,
    opponentBlindCount: 5,
    opponentSelectedHand: null,
    opponentBlindHand: null,
    upcard: null,
    turnedDownSuit: null,
    trump: 'hearts',
    maker: HUMAN,
    lonerTier: null,
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 1,
    actingHand: null,
    ...overrides,
  };
}

/** These two functions together ARE RULES.md §6: "only the hand currently taking its turn is
 *  shown to its owner ... never seeing both simultaneously." A previous version broke this by
 *  showing a hand face-up at its seat AND in the tray at once (2e.7) — pinned directly here so
 *  a future edit to either function's phase lists can't silently reopen that gap. */
describe('isHeld (which hand is picked up into the tray)', () => {
  it('the acting hand is held, regardless of whose it is', () => {
    const view = makeView({ actingHand: humanSelected });
    expect(isHeld(view, humanSelected)).toBe(true);
  });

  it('a non-acting hand is not held during play', () => {
    const view = makeView({ actingHand: humanSelected });
    expect(isHeld(view, humanBlind)).toBe(false);
  });

  it('your OWN selected hand is held during bidding once it is visible', () => {
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: CARDS, actingHand: null });
    expect(isHeld(view, humanSelected)).toBe(true);
  });

  it('your BLIND hand is never held during bidding — you have not looked at it yet', () => {
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: CARDS, actingHand: null });
    expect(isHeld(view, humanBlind)).toBe(false);
  });

  it('the opponent\'s hand is never held for you during bidding, even by phase alone', () => {
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: CARDS, actingHand: null });
    expect(isHeld(view, botSelected)).toBe(false);
  });

  it('your selected hand is not held during bidding before it has been revealed to you', () => {
    // ownSelectedHand is null (not yet selected/revealed) — nothing to pick up yet.
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: null, actingHand: null });
    expect(isHeld(view, humanSelected)).toBe(false);
  });

  it('bidding-hand pickup does not apply outside the bidding phases', () => {
    const view = makeView({ phase: 'play', ownSelectedHand: CARDS, actingHand: null });
    expect(isHeld(view, humanSelected)).toBe(false);
  });
});

describe('visibleCards (what shows face-up AT THE SEAT, never in the tray)', () => {
  it('shows nothing at the seat during active play — a visible hand of yours is the HELD one', () => {
    const view = makeView({ phase: 'play', ownSelectedHand: CARDS });
    expect(visibleCards(view, humanSelected)).toBeNull();
  });

  it('shows nothing at the seat during bidding, even once your hand is visible to you', () => {
    // This is the exact regression 2e.7 fixed: ownSelectedHand stays populated for the whole
    // deal once selected, so a phase check (not just a redact() null-check) is required —
    // otherwise the hand would be face-up at the seat AND held in the tray simultaneously.
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: CARDS });
    expect(visibleCards(view, humanSelected)).toBeNull();
  });

  it('reveals both players\' hands once the deal is over', () => {
    const view = makeView({
      phase: 'hand_complete',
      ownSelectedHand: CARDS,
      opponentBlindHand: CARDS,
    });
    expect(visibleCards(view, humanSelected)).toBe(CARDS);
    expect(visibleCards(view, { player: BOT, role: 'blind' })).toBe(CARDS);
  });

  it('reveals nothing that redact() itself did not populate, even post-deal', () => {
    const view = makeView({ phase: 'game_over', ownBlindHand: null });
    expect(visibleCards(view, humanBlind)).toBeNull();
  });
});
