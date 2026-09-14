import type { Card, Rank, Suit, TrickCard } from './types.ts';
import { SUITS } from './deck.ts';

const SAME_COLOR: Record<Suit, Suit> = {
  clubs: 'spades',
  spades: 'clubs',
  diamonds: 'hearts',
  hearts: 'diamonds',
};

export function leftBowerSuit(trump: Suit): Suit {
  return SAME_COLOR[trump];
}

export function isRightBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === trump;
}

export function isLeftBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === leftBowerSuit(trump);
}

/** The suit a card counts as for follow-suit and trick-winning purposes. */
export function effectiveSuit(card: Card, trump: Suit): Suit {
  if (isRightBower(card, trump) || isLeftBower(card, trump)) return trump;
  return card.suit;
}

export function isTrump(card: Card, trump: Suit): boolean {
  return effectiveSuit(card, trump) === trump;
}

const PLAIN_RANK_ORDER: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A'];

export function trumpRank(card: Card, trump: Suit): number {
  if (isRightBower(card, trump)) return 6;
  if (isLeftBower(card, trump)) return 5;
  // A=4, K=3, Q=2, 10=1, 9=0 for the remaining trump-suit cards.
  return PLAIN_RANK_ORDER.indexOf(card.rank) - 1;
}

/** Context-free strength of a card under a given trump — for hand evaluation (bidding,
 *  discarding, choosing what to lead), not for scoring a specific in-progress trick. Trump
 *  cards always outrank non-trump, unlike trickWinnerIndex's led-suit-relative scoring. */
export function cardStrength(card: Card, trump: Suit): number {
  if (isTrump(card, trump)) return 100 + trumpRank(card, trump);
  return PLAIN_RANK_ORDER.indexOf(card.rank);
}

/** Orders a hand for DISPLAY: trump first, then the other suits, strongest card leftmost.
 *
 *  Uses `effectiveSuit`, which is the whole reason this belongs in the engine rather than in a
 *  component. Under trump, the left bower is not a card of its printed suit — it IS trump, and
 *  a naive `sort by card.suit` files the jack of diamonds under diamonds while it is being
 *  played as a spade. That is precisely the card a player most needs to see in the right place.
 *
 *  Purely presentational: nothing here affects legality or scoring, and it never mutates the
 *  hand it is given. Before trump is named there is no trump group, so it falls back to suit
 *  then rank.
 */
export function sortHandForDisplay(hand: Card[], trump: Suit | null): Card[] {
  const group = (card: Card): number =>
    trump && isTrump(card, trump) ? -1 : SUITS.indexOf(card.suit);
  const within = (a: Card, b: Card): number =>
    trump && isTrump(a, trump)
      ? cardStrength(b, trump) - cardStrength(a, trump)
      : PLAIN_RANK_ORDER.indexOf(b.rank) - PLAIN_RANK_ORDER.indexOf(a.rank);
  return [...hand].sort((a, b) => group(a) - group(b) || within(a, b));
}

/** Cards from `hand` that are legal to play given the trick's led effective suit. */
export function legalPlays(hand: Card[], ledEffectiveSuit: Suit | null, trump: Suit): Card[] {
  if (ledEffectiveSuit === null) return hand;
  const followers = hand.filter((c) => effectiveSuit(c, trump) === ledEffectiveSuit);
  return followers.length > 0 ? followers : hand;
}

/** Index into `trick` of the winning card. */
export function trickWinnerIndex(trick: TrickCard[], trump: Suit): number {
  if (trick.length === 0) throw new Error('cannot score an empty trick');
  const ledEffectiveSuit = effectiveSuit(trick[0]!.card, trump);

  let bestIndex = 0;
  let bestScore = -Infinity;
  trick.forEach((played, i) => {
    const card = played.card;
    let score: number;
    if (isTrump(card, trump)) {
      score = 1000 + trumpRank(card, trump);
    } else if (card.suit === ledEffectiveSuit) {
      score = PLAIN_RANK_ORDER.indexOf(card.rank);
    } else {
      score = -1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });
  return bestIndex;
}
