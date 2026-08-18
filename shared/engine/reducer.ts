import type { Action, Card, Config, GameState, HandId, Player } from './types.ts';
import { deal } from './deck.ts';
import { otherPlayer, legalActions, actingHand } from './legal.ts';
import { trickWinnerIndex } from './rules.ts';

function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function removeCard(hand: Card[], card: Card): Card[] {
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx === -1) throw new Error(`card not in hand: ${card.rank} of ${card.suit}`);
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

export function newGame(seed: string, dealer: Player = 'A', config: Config): GameState {
  const { players, kitty } = deal(seed);
  return {
    phase: 'select',
    seed,
    dealer,
    config,
    gameScore: { A: 0, B: 0 },
    winner: null,
    players,
    kitty,
    turnedDownSuit: null,
    trump: null,
    maker: null,
    lonerTier: null,
    selectedHandsRevealed: false,
    upcardRevealed: false,
    passedBy: [],
    ringOrder: null,
    currentTrickLeaderRingIndex: 0,
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 0,
    history: [],
  };
}

/** Starts the next deal, carrying gameScore forward. Dealer alternates unless the previous
 *  deal was thrown in (misdeal), in which case the same dealer redeals. */
export function nextDeal(state: GameState, seed: string): GameState {
  const dealer = state.phase === 'misdeal' ? state.dealer : otherPlayer(state.dealer);
  const fresh = newGame(seed, dealer, state.config);
  return { ...fresh, gameScore: state.gameScore };
}

function assertLegal(state: GameState, action: Action): void {
  const player =
    'player' in action
      ? action.player
      : action.type === 'DEALER_DISCARD'
        ? state.dealer
        : actingHand(state)!.player;
  const legal = legalActions(state, player);
  const found = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
  if (!found) {
    throw new Error(`illegal action ${JSON.stringify(action)} in phase ${state.phase}`);
  }
}

function buildRing(state: GameState): HandId[] {
  const nonDealer = otherPlayer(state.dealer);
  const full: HandId[] = [
    { player: nonDealer, role: 'selected' },
    { player: state.dealer, role: 'selected' },
    { player: nonDealer, role: 'blind' },
    { player: state.dealer, role: 'blind' },
  ];
  if (state.lonerTier && state.maker) {
    return full.filter((h) => !(h.player === state.maker && h.role === 'blind'));
  }
  return full;
}

function enterPlay(state: GameState): GameState {
  const nonDealer = otherPlayer(state.dealer);
  const ringOrder = buildRing(state);
  const leaderIndex = ringOrder.findIndex((h) => h.player === nonDealer && h.role === 'selected');
  return {
    ...state,
    phase: 'play',
    ringOrder,
    currentTrickLeaderRingIndex: leaderIndex,
    currentTrick: [],
    trickNumber: 0,
    tricksWon: { A: 0, B: 0 },
  };
}

function enterDealerExchange(state: GameState): GameState {
  const dealer = state.dealer;
  const upcard = state.kitty[0]!;
  const dealerHand = [...(state.players[dealer].selectedHand ?? []), upcard];
  return {
    ...state,
    phase: 'dealer_exchange',
    upcardRevealed: true,
    players: {
      ...state.players,
      [dealer]: { ...state.players[dealer], selectedHand: dealerHand },
    },
  };
}

function settleScore(state: GameState): GameState {
  const maker = state.maker!;
  const defender = otherPlayer(maker);
  const makerTricks = state.tricksWon[maker];

  let points: number;
  let recipient: Player;
  if (makerTricks >= 3) {
    recipient = maker;
    points =
      makerTricks === 5
        ? state.lonerTier
          ? state.config.lonerPoints[state.lonerTier]
          : 2
        : 1;
  } else {
    recipient = defender;
    points = 2;
  }

  const gameScore = { ...state.gameScore, [recipient]: state.gameScore[recipient] + points };
  const winner = gameScore[recipient] >= state.config.gameTarget ? recipient : null;

  return {
    ...state,
    gameScore,
    winner,
    phase: winner ? 'game_over' : 'hand_complete',
  };
}

export function reduce(state: GameState, action: Action): GameState {
  assertLegal(state, action);
  const history = [...state.history, action];
  const base = { ...state, history };

  switch (action.type) {
    case 'SELECT_HAND': {
      const { player, packetIndex } = action;
      const packets = base.players[player].packets!;
      const selectedHand = packets[packetIndex];
      const blindHand = packets[packetIndex === 0 ? 1 : 0];
      const players = {
        ...base.players,
        [player]: { packets: null, selectedHand, blindHand },
      };
      const bothSelected = Object.values(players).every((p) => p.selectedHand !== null);
      return {
        ...base,
        players,
        phase: bothSelected ? 'loner_full_blind' : 'select',
        passedBy: bothSelected ? [] : base.passedBy,
      };
    }

    case 'DECLARE_FULL_BLIND_LONER': {
      const withMaker = {
        ...base,
        maker: action.player,
        lonerTier: 'full_blind' as const,
        trump: base.kitty[0]!.suit,
        passedBy: [],
      };
      return enterDealerExchange(withMaker);
    }

    case 'DECLARE_BLIND_TRUMP_LONER': {
      const withMaker = {
        ...base,
        maker: action.player,
        lonerTier: 'blind_trump' as const,
        trump: action.suit,
        passedBy: [],
      };
      return enterDealerExchange(withMaker);
    }

    case 'ORDER_UP': {
      const withMaker = {
        ...base,
        maker: action.player,
        lonerTier: action.loner ? ('standard' as const) : null,
        trump: base.kitty[0]!.suit,
        passedBy: [],
      };
      return enterDealerExchange(withMaker);
    }

    case 'NAME_TRUMP': {
      const withMaker = {
        ...base,
        maker: action.player,
        lonerTier: action.loner ? ('standard' as const) : null,
        trump: action.suit,
        passedBy: [],
      };
      return enterPlay(withMaker);
    }

    case 'PASS': {
      const passedBy = [...base.passedBy, action.player];
      if (passedBy.length < 2) return { ...base, passedBy };

      switch (base.phase) {
        case 'loner_full_blind':
          return { ...base, phase: 'loner_blind_trump', passedBy: [], selectedHandsRevealed: true };
        case 'loner_blind_trump':
          return { ...base, phase: 'bidding_round1', passedBy: [], upcardRevealed: true };
        case 'bidding_round1':
          return {
            ...base,
            phase: 'bidding_round2',
            passedBy: [],
            turnedDownSuit: base.kitty[0]!.suit,
          };
        case 'bidding_round2':
          return { ...base, phase: 'misdeal', passedBy: [] };
        default:
          throw new Error(`PASS not valid in phase ${base.phase}`);
      }
    }

    case 'DEALER_DISCARD': {
      const dealer = base.dealer;
      const selectedHand = removeCard(base.players[dealer].selectedHand!, action.card);
      const players = { ...base.players, [dealer]: { ...base.players[dealer], selectedHand } };
      return enterPlay({ ...base, players });
    }

    case 'PLAY_CARD': {
      const ring = base.ringOrder!;
      const actingIndex =
        (base.currentTrickLeaderRingIndex + base.currentTrick.length) % ring.length;
      const hand = ring[actingIndex]!;
      const ph = base.players[hand.player];
      const key = hand.role === 'selected' ? 'selectedHand' : 'blindHand';
      const newHandCards = removeCard(ph[key]!, action.card);
      const players = { ...base.players, [hand.player]: { ...ph, [key]: newHandCards } };
      const currentTrick = [...base.currentTrick, { handId: hand, card: action.card }];

      let next: GameState = { ...base, players, currentTrick };

      if (currentTrick.length === ring.length) {
        const winnerOffset = trickWinnerIndex(currentTrick, base.trump!);
        const winnerRingIndex = (base.currentTrickLeaderRingIndex + winnerOffset) % ring.length;
        const winningPlayer = ring[winnerRingIndex]!.player;
        const tricksWon = { ...base.tricksWon, [winningPlayer]: base.tricksWon[winningPlayer] + 1 };
        const trickNumber = base.trickNumber + 1;

        next = {
          ...next,
          tricksWon,
          trickNumber,
          currentTrick: [],
          currentTrickLeaderRingIndex: winnerRingIndex,
        };

        if (trickNumber === 5) {
          next = settleScore(next);
        }
      }

      return next;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`unhandled action ${JSON.stringify(_exhaustive)}`);
    }
  }
}
