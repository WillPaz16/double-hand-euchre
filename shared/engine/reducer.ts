import type { Action, Card, Config, GameState, HandId, Player } from './types.ts';
import { deal } from './deck.ts';
import { otherPlayer, legalActions, actingHand, trickOrder, sameHand } from './legal.ts';
import { sameAction } from './action.ts';
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
  // Structural comparison, not `JSON.stringify` equality — see `sameAction`'s own docstring.
  // This is the authoritative legality guard every action passes through, including ones that
  // arrived over a socket and were re-parsed, where key order is the sender's choice and not
  // ours.
  const found = legal.some((a) => sameAction(a, action));
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

/** Where to land right after both hands are selected, given which blind loner tiers this
 *  game's config has enabled. A disabled tier's window is skipped outright — not entered and
 *  auto-passed — so turning a tier off costs zero extra clicks, not a dead "Pass" screen.
 *  Skipping a window still has to apply the reveal flags that window's own exit would have
 *  set (see the `PASS` handler below), or a skipped-both-tiers game would reach bidding_round1
 *  with the upcard still hidden. */
function enterLonerWindows(state: GameState): GameState {
  const { blind_hand, full_blind } = state.config.lonerTiersEnabled;
  if (full_blind) return { ...state, phase: 'loner_full_blind' };
  if (blind_hand) return { ...state, phase: 'loner_blind_hand', upcardRevealed: true };
  return { ...state, phase: 'bidding_round1', upcardRevealed: true, selectedHandsRevealed: true };
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
      const withPlayers = { ...base, players, passedBy: bothSelected ? [] : base.passedBy };
      return bothSelected ? enterLonerWindows(withPlayers) : { ...withPlayers, phase: 'select' };
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

    case 'DECLARE_BLIND_HAND_LONER': {
      // Trump is the upcard's suit, not a player choice — the whole point of this tier is
      // that trump is the KNOWN part (you've seen the upcard) and your hand is the unknown
      // part. Same shape as DECLARE_FULL_BLIND_LONER just below.
      const withMaker = {
        ...base,
        maker: action.player,
        lonerTier: 'blind_hand' as const,
        trump: base.kitty[0]!.suit,
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
        // Swapped from v1 (§2 correction): the upcard turns FIRST, then the blind-hand
        // window sees it but not the player's own cards. selectedHandsRevealed now happens
        // at the end of THIS window, immediately before bidding_round1 needs to read hands.
        case 'loner_full_blind':
          if (!base.config.lonerTiersEnabled.blind_hand) {
            return {
              ...base,
              phase: 'bidding_round1',
              passedBy: [],
              upcardRevealed: true,
              selectedHandsRevealed: true,
            };
          }
          return { ...base, phase: 'loner_blind_hand', passedBy: [], upcardRevealed: true };
        case 'loner_blind_hand':
          return { ...base, phase: 'bidding_round1', passedBy: [], selectedHandsRevealed: true };
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
      // `trickOrder`, not the ring rotated by hand: under a loner the two differ (see that
      // function's docstring). This branch recomputing the cyclic index itself is what made the
      // ordering a single change across two files — left alone, the reducer would have removed
      // the played card from whichever hand the OLD order said was acting, quietly emptying the
      // wrong hand while the UI highlighted the right one.
      const order = trickOrder(base);
      const hand = order[base.currentTrick.length]!;
      const ph = base.players[hand.player];
      const key = hand.role === 'selected' ? 'selectedHand' : 'blindHand';
      const newHandCards = removeCard(ph[key]!, action.card);
      const players = { ...base.players, [hand.player]: { ...ph, [key]: newHandCards } };
      const currentTrick = [...base.currentTrick, { handId: hand, card: action.card }];

      let next: GameState = { ...base, players, currentTrick };

      if (currentTrick.length === order.length) {
        // `trickWinnerIndex` returns a position within the TRICK, so it maps through the trick
        // order to a hand, and only then back to a ring index. Adding the offset to the leader's
        // ring index directly (what this did) is the same thing only while the trick order is
        // the ring rotated — which a loner's no longer is, so it would have handed the next
        // lead to the wrong hand.
        const winnerOffset = trickWinnerIndex(currentTrick, base.trump!);
        const winningHand = order[winnerOffset]!;
        const winnerRingIndex = ring.findIndex((h) => sameHand(h, winningHand));
        const winningPlayer = winningHand.player;
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
