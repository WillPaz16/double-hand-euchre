/**
 * v1 heuristic bot: count trump, lead high, follow suit smart. This is the Phase 2/2a
 * placeholder opponent and the EV baseline that Phase 5 (search) and Phase 6 (ML) must beat.
 * Operates only on a redacted PlayerView plus the legal actions the engine already computed
 * for this seat — it is structurally incapable of seeing hidden cards.
 */
import type { Action, Card, PlayerView, Suit } from '../engine/types.ts';
import { cardStrength, isTrump, trickWinnerIndex } from '../engine/rules.ts';

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

const ORDER_UP_TRUMP_THRESHOLD = 3;
const ORDER_UP_LONER_THRESHOLD = 4;
const NAME_TRUMP_THRESHOLD = 3;

function countTrump(hand: Card[], suit: Suit): number {
  return hand.filter((c) => isTrump(c, suit)).length;
}

function bestSuitByTrumpCount(hand: Card[], candidates: Suit[]): Suit {
  return candidates.reduce((a, b) => (countTrump(hand, b) > countTrump(hand, a) ? b : a));
}

function highest(cards: Card[], trump: Suit): Card {
  return cards.reduce((best, c) => (cardStrength(c, trump) > cardStrength(best, trump) ? c : best));
}

function lowest(cards: Card[], trump: Suit): Card {
  return cards.reduce((worst, c) => (cardStrength(c, trump) < cardStrength(worst, trump) ? c : worst));
}

function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function byType<T extends Action['type']>(legal: Action[], type: T) {
  return legal.filter((a): a is Extract<Action, { type: T }> => a.type === type);
}

function findCardAction(
  options: Extract<Action, { card: Card }>[],
  card: Card,
): Action {
  const found = options.find((a) => cardsEqual(a.card, card));
  if (!found) throw new Error('bot selected a card outside its legal options');
  return found;
}

/** Whether `card`, played onto the trick right now, would currently be winning — no
 *  guarantee about cards the other hand(s) haven't played yet this trick. */
function wouldCurrentlyWin(card: Card, view: PlayerView, trump: Suit): boolean {
  const hypothetical = [...view.currentTrick, { handId: view.actingHand!, card }];
  return trickWinnerIndex(hypothetical, trump) === hypothetical.length - 1;
}

export function chooseMove(view: PlayerView, legal: Action[]): Action {
  if (legal.length === 0) throw new Error('no legal actions available for bot');
  if (legal.length === 1) return legal[0]!;

  switch (view.phase) {
    case 'select': {
      // Both packets are equally unknown before the pick — nothing to base a preference on.
      return byType(legal, 'SELECT_HAND')[0]!;
    }

    case 'loner_full_blind': {
      // Zero information by definition of this window — never gamble blind here.
      return byType(legal, 'PASS')[0]!;
    }

    case 'loner_blind_hand': {
      // Swapped tier (§2 correction): trump is known (the upcard), but your own hand is NOT
      // — view.ownSelectedHand is null here, same as loner_full_blind. There is nothing left
      // to evaluate, so the bot never gambles on this tier either. It is a genuine gap for
      // single-player (this and the 8pt tier are dead code for the bot) but a correct one:
      // guessing without your hand isn't a heuristic, it's a coin flip.
      return byType(legal, 'PASS')[0]!;
    }

    case 'bidding_round1': {
      const hand = view.ownSelectedHand!;
      const trump = view.upcard!.suit;
      const trumpCount = countTrump(hand, trump);
      if (trumpCount >= ORDER_UP_TRUMP_THRESHOLD) {
        const loner = trumpCount >= ORDER_UP_LONER_THRESHOLD;
        const order = legal.find((a) => a.type === 'ORDER_UP' && a.loner === loner);
        if (order) return order;
      }
      return byType(legal, 'PASS')[0] ?? legal[0]!;
    }

    case 'bidding_round2': {
      const hand = view.ownSelectedHand!;
      const nameable = [...new Set(byType(legal, 'NAME_TRUMP').map((a) => a.suit))];
      const best = bestSuitByTrumpCount(hand, nameable);
      const passOption = byType(legal, 'PASS')[0];
      const trumpCount = countTrump(hand, best);
      if (!passOption || trumpCount >= NAME_TRUMP_THRESHOLD) {
        const loner = trumpCount >= ORDER_UP_LONER_THRESHOLD;
        const name =
          legal.find((a) => a.type === 'NAME_TRUMP' && a.suit === best && a.loner === loner) ??
          legal.find((a) => a.type === 'NAME_TRUMP' && a.suit === best);
        if (name) return name;
      }
      return passOption ?? legal[0]!;
    }

    case 'dealer_exchange': {
      const hand = view.ownSelectedHand!;
      const trump = view.trump!;
      const worst = lowest(hand, trump);
      return findCardAction(byType(legal, 'DEALER_DISCARD'), worst);
    }

    case 'play': {
      const trump = view.trump!;
      const options = byType(legal, 'PLAY_CARD').map((a) => a.card);
      if (view.currentTrick.length === 0) {
        return findCardAction(byType(legal, 'PLAY_CARD'), highest(options, trump));
      }
      const winners = options.filter((c) => wouldCurrentlyWin(c, view, trump));
      const pick = winners.length > 0 ? lowest(winners, trump) : lowest(options, trump);
      return findCardAction(byType(legal, 'PLAY_CARD'), pick);
    }

    default:
      return legal[0]!;
  }
}
