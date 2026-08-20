export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type Player = 'A' | 'B';
export type HandRole = 'selected' | 'blind';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface HandId {
  player: Player;
  role: HandRole;
}

export type LonerTier = 'standard' | 'blind_hand' | 'full_blind';

export type Phase =
  | 'select'
  | 'loner_full_blind'
  | 'loner_blind_hand'
  | 'bidding_round1'
  | 'bidding_round2'
  | 'dealer_exchange'
  | 'play'
  | 'hand_complete'
  | 'misdeal'
  | 'game_over';

export interface PlayerHands {
  /** Two dealt packets, present only before SELECT_HAND; cleared once selection resolves. */
  packets: [Card[], Card[]] | null;
  selectedHand: Card[] | null;
  blindHand: Card[] | null;
}

export interface TrickCard {
  handId: HandId;
  card: Card;
}

export interface GameState {
  phase: Phase;
  seed: string;
  dealer: Player;
  config: Config;

  gameScore: Record<Player, number>;
  winner: Player | null;

  players: Record<Player, PlayerHands>;
  /** kitty[0] is the upcard; kitty[1..3] are buried and never used. */
  kitty: Card[];

  turnedDownSuit: Suit | null;
  trump: Suit | null;
  maker: Player | null;
  lonerTier: LonerTier | null;

  selectedHandsRevealed: boolean;
  upcardRevealed: boolean;
  /** Players who have passed in the current select/bidding-style phase step; resets each phase entry. */
  passedBy: Player[];

  /** Fixed for the whole deal once established; excludes the loner's blind hand if any. */
  ringOrder: HandId[] | null;
  currentTrickLeaderRingIndex: number;
  currentTrick: TrickCard[];
  tricksWon: Record<Player, number>;
  trickNumber: number;

  history: Action[];
}

export type Action =
  | { type: 'SELECT_HAND'; player: Player; packetIndex: 0 | 1 }
  | { type: 'DECLARE_FULL_BLIND_LONER'; player: Player }
  /* No `suit` field — the trump for this tier IS the upcard's suit (§2). You've seen the
     upcard turned face-up, but not your own hand; the reverse of the standard-loner
     information state, hence "blind hand" rather than "blind trump". */
  | { type: 'DECLARE_BLIND_HAND_LONER'; player: Player }
  | { type: 'ORDER_UP'; player: Player; loner?: boolean }
  | { type: 'NAME_TRUMP'; player: Player; suit: Suit; loner?: boolean }
  | { type: 'PASS'; player: Player }
  | { type: 'DEALER_DISCARD'; card: Card }
  | { type: 'PLAY_CARD'; card: Card };

export interface Config {
  stickTheDealer: boolean;
  gameTarget: number;
  lonerPoints: Record<LonerTier, number>;
}

export interface PlayerView {
  you: Player;
  phase: Phase;
  dealer: Player;
  gameScore: Record<Player, number>;
  winner: Player | null;

  /** Your own hands — only populated when visible to you right now. */
  ownSelectedHand: Card[] | null;
  ownBlindHand: Card[] | null;
  /** Card counts only, for the opponent — never their contents unless post-hoc revealed. */
  opponentSelectedCount: number;
  opponentBlindCount: number;
  opponentSelectedHand: Card[] | null;
  opponentBlindHand: Card[] | null;

  upcard: Card | null;
  turnedDownSuit: Suit | null;
  trump: Suit | null;
  maker: Player | null;
  lonerTier: LonerTier | null;

  currentTrick: TrickCard[];
  tricksWon: Record<Player, number>;
  trickNumber: number;

  /** Whose hand is on the clock right now, if any (play/dealer_exchange). */
  actingHand: HandId | null;
}
