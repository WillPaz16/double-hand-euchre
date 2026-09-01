import type { Card, Config, GameState, HandId, LonerTier, Player, Suit } from '../shared/engine/types.ts';
import { DEFAULT_CONFIG } from '../shared/engine/config.ts';
import { reduce, newGame } from '../shared/engine/reducer.ts';
import { otherPlayer, legalActions } from '../shared/engine/legal.ts';

export function selectHands(
  state: GameState,
  packets: { A: 0 | 1; B: 0 | 1 } = { A: 0, B: 0 },
): GameState {
  const nonDealer = otherPlayer(state.dealer);
  let s = reduce(state, { type: 'SELECT_HAND', player: nonDealer, packetIndex: packets[nonDealer] });
  s = reduce(s, { type: 'SELECT_HAND', player: state.dealer, packetIndex: packets[state.dealer] });
  return s;
}

const LONER_WINDOW_PHASES = new Set(['loner_full_blind', 'loner_blind_hand']);

/** Passes through whichever loner windows the state's config has actually left enabled,
 *  landing in bidding_round1. A disabled tier's window never opens (see `enterLonerWindows`
 *  in reducer.ts), so this loops on phase rather than assuming a fixed pass count — with the
 *  default config that's still exactly full-blind then blind-hand, 4 passes total. */
export function passLonerWindows(state: GameState): GameState {
  const nonDealer = otherPlayer(state.dealer);
  let s = state;
  while (LONER_WINDOW_PHASES.has(s.phase)) {
    s = reduce(s, { type: 'PASS', player: nonDealer });
    if (!LONER_WINDOW_PHASES.has(s.phase)) break;
    s = reduce(s, { type: 'PASS', player: state.dealer });
  }
  return s;
}

/** From a fresh newGame state: select both hands, decline all loner windows, order up round 1. */
export function orderUpRound1(state: GameState, orderer?: Player, loner = false): GameState {
  let s = selectHands(state);
  s = passLonerWindows(s);
  const player = orderer ?? otherPlayer(state.dealer);
  return reduce(s, { type: 'ORDER_UP', player, loner });
}

export function dealerDiscardFirstLegal(state: GameState): GameState {
  const dealer = state.dealer;
  const hand = state.players[dealer].selectedHand!;
  return reduce(state, { type: 'DEALER_DISCARD', card: hand[0]! });
}

export interface PlayStateOptions {
  dealer?: Player;
  trump: Suit;
  maker: Player;
  lonerTier?: LonerTier | null;
  config?: Config;
  hands: {
    nonDealerSelected: Card[];
    dealerSelected: Card[];
    nonDealerBlind: Card[];
    dealerBlind: Card[];
  };
}

/** Directly builds a `play`-phase GameState with fully controlled hands, bypassing dealing
 *  and bidding entirely. For precise, deterministic trick/scoring assertions. */
export function makePlayState(opts: PlayStateOptions): GameState {
  const dealer = opts.dealer ?? 'B';
  const nonDealer = otherPlayer(dealer);
  const config = opts.config ?? DEFAULT_CONFIG;
  const lonerTier = opts.lonerTier ?? null;

  const players: GameState['players'] = {
    [nonDealer]: {
      packets: null,
      selectedHand: [...opts.hands.nonDealerSelected],
      blindHand: [...opts.hands.nonDealerBlind],
    },
    [dealer]: {
      packets: null,
      selectedHand: [...opts.hands.dealerSelected],
      blindHand: [...opts.hands.dealerBlind],
    },
  } as GameState['players'];

  let ring: HandId[] = [
    { player: nonDealer, role: 'selected' },
    { player: dealer, role: 'selected' },
    { player: nonDealer, role: 'blind' },
    { player: dealer, role: 'blind' },
  ];
  if (lonerTier) {
    ring = ring.filter((h) => !(h.player === opts.maker && h.role === 'blind'));
  }

  const base = newGame('unused-seed-for-manual-state', dealer, config);
  return {
    ...base,
    phase: 'play',
    players,
    trump: opts.trump,
    maker: opts.maker,
    lonerTier,
    selectedHandsRevealed: true,
    upcardRevealed: true,
    ringOrder: ring,
    currentTrickLeaderRingIndex: ring.findIndex((h) => h.player === nonDealer && h.role === 'selected'),
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 0,
  };
}

/** Plays out an entire 'play'-phase hand by always taking the acting player's first legal
 *  action, until the phase leaves 'play'. Deterministic given the hands already assigned. */
export function playOutHand(state: GameState): GameState {
  let s = state;
  while (s.phase === 'play') {
    const acting = s.ringOrder![
      (s.currentTrickLeaderRingIndex + s.currentTrick.length) % s.ringOrder!.length
    ]!;
    const options = legalActions(s, acting.player);
    const action = options[0];
    if (!action) throw new Error('no legal action available mid-play');
    s = reduce(s, action);
  }
  return s;
}
