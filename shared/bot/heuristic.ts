/**
 * v1 heuristic bot: trump COUNT as the primary signal (as before), with card QUALITY as an
 * exception for a genuinely elite 2-card holding, plus a lead that draws out trump instead of
 * always burning the highest card in hand. This is the Phase 2/2a placeholder opponent and the
 * EV baseline that Phase 5 (search) and Phase 6 (ML) must beat. Operates only on a redacted
 * PlayerView plus the legal actions the engine already computed for this seat — it is
 * structurally incapable of seeing hidden cards.
 *
 * **2h.5 raised this baseline without changing its shape** (`chooseMove`'s signature and the
 * phase-by-phase structure are unchanged — Phase 5/6 stay drop-in). What changed, and how it
 * was actually validated: not by inspection alone, but by playing the new version against the
 * old one directly (1000 games, seats alternated to cancel any positional effect — see the
 * git history for the throwaway comparison script, not kept in the repo).
 *
 * **The first attempt made things WORSE, and the reason is worth recording.** A pure point-sum
 * hand-strength function (`trumpRank(card) + 1` per trump card, summed) replaced `countTrump`
 * as the ORDER_UP gate outright. That measurably lost to the original count-only bot, 43.9% to
 * 56.1%. Instrumented why: a SINGLE right or left bower alone already scores 6-7 under a pure
 * sum, clearing a threshold calibrated to admit "three weak trump" (which also scores 6) — so
 * the bot started ordering up on ONE strong card and nothing else (2757 order-ups across 300
 * self-play games, versus 548 for the original). One elite card is not the same as trump
 * CONTROL; a linear point-sum conflates the two. Count has to stay the primary gate, with
 * quality only ever promoting a genuine edge case — never replacing count outright. */
import type { Action, Card, PlayerView, Suit } from '../engine/types.ts';
import { cardStrength, isTrump, trickWinnerIndex, trumpRank } from '../engine/rules.ts';

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

function countTrump(hand: Card[], suit: Suit): number {
  return hand.filter((c) => isTrump(c, suit)).length;
}

/** Card QUALITY, for the exception cases below — never the primary gate (see the file
 *  docstring for why). `trumpRank` already encodes real euchre ordering (right bower 6 .. 9 is
 *  0), so `trumpRank + 1` per trump card (1..7 each) weighs a bower far above a bare 9 instead
 *  of counting them as identical "one trump card". */
function handStrength(hand: Card[], trump: Suit): number {
  let score = 0;
  for (const card of hand) {
    if (isTrump(card, trump)) score += trumpRank(card, trump) + 1;
  }
  return score;
}

/** ORDER_UP / NAME_TRUMP: the count gate exactly as before (trumpCount >= 3), PLUS an
 *  exception for a 2-card holding that is genuinely elite — both bowers (13), or a bower with
 *  the trump ace (11-12) — cases a bare count of 2 always passed on despite being stronger
 *  than plenty of 3-card hands that clear the count gate. `ELITE_TWO_CARD_THRESHOLD` is set
 *  ABOVE "bower + trump king" (10) specifically so it stays a genuinely rare exception rather
 *  than quietly widening into "any 2 decent trump", which is what broke the first attempt. */
const ORDER_UP_COUNT_THRESHOLD = 3;
const ELITE_TWO_CARD_THRESHOLD = 11;
const ORDER_UP_LONER_COUNT_THRESHOLD = 4;
/** A 3-card holding this strong (right + left + trump ace = 6+5+4 = 15) is loner-worthy even
 *  one card short of the count-only threshold — an exception on top of an exception, so it
 *  only fires for a genuinely exceptional 3-card trump run. */
const ELITE_THREE_CARD_LONER_THRESHOLD = 15;

function shouldOrderUp(hand: Card[], trump: Suit): boolean {
  const count = countTrump(hand, trump);
  if (count >= ORDER_UP_COUNT_THRESHOLD) return true;
  return count === 2 && handStrength(hand, trump) >= ELITE_TWO_CARD_THRESHOLD;
}

function shouldGoAlone(hand: Card[], trump: Suit): boolean {
  const count = countTrump(hand, trump);
  if (count >= ORDER_UP_LONER_COUNT_THRESHOLD) return true;
  return count === 3 && handStrength(hand, trump) >= ELITE_THREE_CARD_LONER_THRESHOLD;
}

/** Best candidate suit by COUNT first, breaking ties by quality — not by quality alone, for
 *  the same reason the bidding gate above stays count-first: a suit where you hold one bower
 *  and nothing else must never outrank a suit where you hold three genuine trump. */
function bestSuit(hand: Card[], candidates: Suit[]): Suit {
  return candidates.reduce((a, b) => {
    const countA = countTrump(hand, a);
    const countB = countTrump(hand, b);
    if (countB !== countA) return countB > countA ? b : a;
    return handStrength(hand, b) > handStrength(hand, a) ? b : a;
  });
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

/** What to lead a trick with. Previously always `highest(options, trump)` — and because
 *  `cardStrength` ranks every trump card above every non-trump card, that meant "lead a lone
 *  trump immediately" whenever the hand held even one, before it ever got a chance to act as a
 *  late-trick stopper. Real euchre strategy: lead trump to DRAW OUT the opponent's trump only
 *  when holding enough of it to survive the exchange (2+); with one or none, lead your best
 *  OFF-SUIT card instead and hold the trump back. */
function chooseLead(options: Card[], trump: Suit): Card {
  const trumpCards = options.filter((c) => isTrump(c, trump));
  if (trumpCards.length >= 2) return highest(trumpCards, trump);
  const offSuit = options.filter((c) => !isTrump(c, trump));
  return offSuit.length > 0 ? highest(offSuit, trump) : highest(options, trump);
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
      // Zero information by definition of this window — never gamble blind here. Re-examined
      // in 2h.5, not just carried forward: this is not the same gap as the other two thresholds
      // above (which really were leaving real information on the table). There is no HAND to
      // evaluate yet at all, so "sometimes gamble anyway" would not be a heuristic, it would be
      // noise — and this project's engine, deliberately, has no source of noise to draw from
      // (§4: no Math.random anywhere in `shared/`). Passing here isn't a placeholder for a
      // future heuristic; it IS the correct heuristic for a window with no signal in it.
      return byType(legal, 'PASS')[0]!;
    }

    case 'loner_blind_hand': {
      // Swapped tier (§2 correction): trump is known (the upcard), but your own hand is NOT
      // — view.ownSelectedHand is null here, same as loner_full_blind. Same reasoning as
      // above: nothing about YOUR cards is observable at this window by construction, so there
      // is no hand to weigh and no version of this decision that isn't a guess. Real single-
      // player games therefore never sample the 6pt/8pt scoring paths from the bot's side —
      // worth knowing before Phase 6 tries to EV-tune those values from self-play data, since
      // self-play between two copies of this bot will never call either tier — but that is a
      // Phase 6 sampling concern, not evidence this bot is playing wrong here.
      return byType(legal, 'PASS')[0]!;
    }

    case 'bidding_round1': {
      const hand = view.ownSelectedHand!;
      const trump = view.upcard!.suit;
      if (shouldOrderUp(hand, trump)) {
        const loner = shouldGoAlone(hand, trump);
        const order = legal.find((a) => a.type === 'ORDER_UP' && a.loner === loner);
        if (order) return order;
      }
      return byType(legal, 'PASS')[0] ?? legal[0]!;
    }

    case 'bidding_round2': {
      const hand = view.ownSelectedHand!;
      const nameable = [...new Set(byType(legal, 'NAME_TRUMP').map((a) => a.suit))];
      const best = bestSuit(hand, nameable);
      const passOption = byType(legal, 'PASS')[0];
      if (!passOption || shouldOrderUp(hand, best)) {
        const loner = shouldGoAlone(hand, best);
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
        return findCardAction(byType(legal, 'PLAY_CARD'), chooseLead(options, trump));
      }
      const winners = options.filter((c) => wouldCurrentlyWin(c, view, trump));
      const pick = winners.length > 0 ? lowest(winners, trump) : lowest(options, trump);
      return findCardAction(byType(legal, 'PLAY_CARD'), pick);
    }

    default:
      return legal[0]!;
  }
}
