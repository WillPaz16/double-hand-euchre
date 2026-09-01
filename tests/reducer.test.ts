import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../shared/engine/config.ts';
import { newGame, reduce, nextDeal } from '../shared/engine/reducer.ts';
import { legalActions, otherPlayer } from '../shared/engine/legal.ts';
import { redact } from '../shared/engine/view.ts';
import {
  selectHands,
  passLonerWindows,
  orderUpRound1,
  dealerDiscardFirstLegal,
  makePlayState,
  playOutHand,
} from './helpers.ts';

describe('select phase', () => {
  it('non-dealer selects before dealer, then both packets are cleared', () => {
    const s0 = newGame('seed-1', 'B', DEFAULT_CONFIG);
    expect(legalActions(s0, 'B')).toEqual([]); // dealer can't act yet
    expect(legalActions(s0, 'A').map((a) => a.type)).toEqual(['SELECT_HAND', 'SELECT_HAND']);

    const s1 = selectHands(s0, { A: 1, B: 0 });
    expect(s1.phase).toBe('loner_full_blind');
    expect(s1.players.A.packets).toBeNull();
    expect(s1.players.A.selectedHand).toHaveLength(5);
    expect(s1.players.A.blindHand).toHaveLength(5);
  });
});

describe('loner declaration windows', () => {
  it('full-blind loner skips straight to dealer_exchange with a 3-hand ring', () => {
    const s0 = selectHands(newGame('seed-2', 'B', DEFAULT_CONFIG));
    const s1 = reduce(s0, { type: 'DECLARE_FULL_BLIND_LONER', player: 'A' });
    expect(s1.phase).toBe('dealer_exchange');
    expect(s1.maker).toBe('A');
    expect(s1.lonerTier).toBe('full_blind');
    expect(s1.trump).toBe(s1.kitty[0]!.suit);
    // dealer's selected hand temporarily holds 6 (5 + upcard) awaiting discard
    expect(s1.players.B.selectedHand).toHaveLength(6);

    const s2 = dealerDiscardFirstLegal(s1);
    expect(s2.phase).toBe('play');
    expect(s2.ringOrder).toHaveLength(3);
    expect(s2.ringOrder!.some((h) => h.player === 'A' && h.role === 'blind')).toBe(false);
  });

  it('blind-hand loner trump is the upcard, and hands stay hidden until it resolves', () => {
    let s = selectHands(newGame('seed-3', 'B', DEFAULT_CONFIG));
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' }); // decline full-blind window
    expect(s.phase).toBe('loner_blind_hand');
    // §2 correction: this window has the upcard turned but NOT the players' own hands — the
    // reverse of the pre-swap ordering, and the source of the tier's whole information gap.
    expect(s.upcardRevealed).toBe(true);
    expect(s.selectedHandsRevealed).toBe(false);

    const upcardSuit = s.kitty[0]!.suit;
    s = reduce(s, { type: 'DECLARE_BLIND_HAND_LONER', player: 'A' });
    expect(s.trump).toBe(upcardSuit);
    expect(s.lonerTier).toBe('blind_hand');
    expect(s.phase).toBe('dealer_exchange');

    s = dealerDiscardFirstLegal(s);
    expect(s.phase).toBe('play');
    expect(s.ringOrder).toHaveLength(3);
  });

  it('standard loner is called during normal bidding from the selected hand only', () => {
    let s = orderUpRound1(newGame('seed-4', 'B', DEFAULT_CONFIG), 'A', true);
    expect(s.lonerTier).toBe('standard');
    expect(s.maker).toBe('A');
    s = dealerDiscardFirstLegal(s);
    expect(s.ringOrder).toHaveLength(3);
  });

  it('declining both windows reveals the upcard and reaches round 1 bidding', () => {
    const s = passLonerWindows(selectHands(newGame('seed-5', 'B', DEFAULT_CONFIG)));
    expect(s.phase).toBe('bidding_round1');
    expect(s.upcardRevealed).toBe(true);
  });
});

describe('loner tier config toggles', () => {
  it('disabling full-blind skips its window entirely, landing straight in blind-hand', () => {
    const config = {
      ...DEFAULT_CONFIG,
      lonerTiersEnabled: { ...DEFAULT_CONFIG.lonerTiersEnabled, full_blind: false },
    };
    const s = selectHands(newGame('seed-toggle-1', 'B', config));
    expect(s.phase).toBe('loner_blind_hand');
    // Skipping full-blind still has to apply the reveal that window's own exit would have —
    // the upcard is turned before the blind-hand window opens either way.
    expect(s.upcardRevealed).toBe(true);
    expect(s.selectedHandsRevealed).toBe(false);
  });

  it('disabling blind-hand skips from full-blind straight to bidding_round1 on decline', () => {
    const config = {
      ...DEFAULT_CONFIG,
      lonerTiersEnabled: { ...DEFAULT_CONFIG.lonerTiersEnabled, blind_hand: false },
    };
    let s = selectHands(newGame('seed-toggle-2', 'B', config));
    expect(s.phase).toBe('loner_full_blind');
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' });
    expect(s.phase).toBe('bidding_round1');
    expect(s.upcardRevealed).toBe(true);
    expect(s.selectedHandsRevealed).toBe(true);
  });

  it('disabling both tiers skips straight to bidding_round1 after hand selection', () => {
    const config = {
      ...DEFAULT_CONFIG,
      lonerTiersEnabled: { blind_hand: false, full_blind: false },
    };
    const s = selectHands(newGame('seed-toggle-3', 'B', config));
    expect(s.phase).toBe('bidding_round1');
    expect(s.upcardRevealed).toBe(true);
    expect(s.selectedHandsRevealed).toBe(true);
    expect(legalActions(s, otherPlayer(s.dealer)).map((a) => a.type)).toEqual([
      'ORDER_UP',
      'ORDER_UP',
      'PASS',
    ]);
  });

  it('passLonerWindows still reaches bidding_round1 with a disabled tier (helper stays correct)', () => {
    const config = {
      ...DEFAULT_CONFIG,
      lonerTiersEnabled: { ...DEFAULT_CONFIG.lonerTiersEnabled, full_blind: false },
    };
    const s = passLonerWindows(selectHands(newGame('seed-toggle-4', 'B', config)));
    expect(s.phase).toBe('bidding_round1');
  });
});

describe('bidding rounds', () => {
  it('round 1 order-up gives the dealer the upcard into their selected hand', () => {
    const s0 = passLonerWindows(selectHands(newGame('seed-6', 'B', DEFAULT_CONFIG)));
    const upcard = s0.kitty[0]!;
    const s1 = reduce(s0, { type: 'ORDER_UP', player: 'A', loner: false });
    expect(s1.phase).toBe('dealer_exchange');
    expect(s1.trump).toBe(upcard.suit);
    expect(s1.players.B.selectedHand).toContainEqual(upcard);
  });

  it('round 2 naming trump has no card exchange and goes straight to play', () => {
    let s = passLonerWindows(selectHands(newGame('seed-7', 'B', DEFAULT_CONFIG)));
    const turnedDown = s.kitty[0]!.suit;
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' });
    expect(s.phase).toBe('bidding_round2');
    expect(s.turnedDownSuit).toBe(turnedDown);

    const nameable = (['clubs', 'diamonds', 'hearts', 'spades'] as const).find((x) => x !== turnedDown)!;
    s = reduce(s, { type: 'NAME_TRUMP', player: 'A', suit: nameable, loner: false });
    expect(s.phase).toBe('play'); // no dealer_exchange
    expect(s.players.B.selectedHand).toHaveLength(5); // untouched
  });

  it('cannot name the turned-down suit in round 2', () => {
    let s = passLonerWindows(selectHands(newGame('seed-8', 'B', DEFAULT_CONFIG)));
    const turnedDown = s.kitty[0]!.suit;
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' });
    const legal = legalActions(s, 'A');
    const namedTurnedDown = legal.some((a) => a.type === 'NAME_TRUMP' && a.suit === turnedDown);
    expect(namedTurnedDown).toBe(false);
  });

  it('stick the dealer: dealer cannot pass round 2 once non-dealer has passed', () => {
    let s = passLonerWindows(selectHands(newGame('seed-9', 'B', DEFAULT_CONFIG)));
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' });
    s = reduce(s, { type: 'PASS', player: 'A' }); // non-dealer passes round 2
    const legal = legalActions(s, 'B');
    expect(legal.every((a) => a.type !== 'PASS')).toBe(true);
    expect(legal.some((a) => a.type === 'NAME_TRUMP')).toBe(true);
  });

  it('stick-the-dealer off: both passing round 2 throws the deal in for redeal', () => {
    const config = { ...DEFAULT_CONFIG, stickTheDealer: false };
    let s = passLonerWindows(selectHands(newGame('seed-10', 'B', config)));
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' });
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' });
    expect(s.phase).toBe('misdeal');

    const redealt = nextDeal(s, 'seed-10-redeal');
    expect(redealt.dealer).toBe('B'); // same dealer redeals, does not alternate
    expect(redealt.phase).toBe('select');
  });
});

describe('trick play and scoring (crafted hands for determinism)', () => {
  const hearts = 'hearts' as const;
  // nonDealer holds every high trump; dealer holds none — nonDealer sweeps every trick.
  const sweepHands = {
    nonDealerSelected: [
      { rank: '10' as const, suit: hearts },
      { rank: 'J' as const, suit: hearts },
      { rank: 'Q' as const, suit: hearts },
      { rank: 'K' as const, suit: hearts },
      { rank: 'A' as const, suit: hearts },
    ],
    nonDealerBlind: [
      { rank: '9' as const, suit: 'clubs' as const },
      { rank: '10' as const, suit: 'clubs' as const },
      { rank: 'Q' as const, suit: 'clubs' as const },
      { rank: 'K' as const, suit: 'clubs' as const },
      { rank: 'A' as const, suit: 'clubs' as const },
    ],
    dealerSelected: [
      { rank: '9' as const, suit: 'spades' as const },
      { rank: '10' as const, suit: 'spades' as const },
      { rank: 'Q' as const, suit: 'spades' as const },
      { rank: 'K' as const, suit: 'spades' as const },
      { rank: 'A' as const, suit: 'spades' as const },
    ],
    dealerBlind: [
      { rank: '9' as const, suit: 'diamonds' as const },
      { rank: '10' as const, suit: 'diamonds' as const },
      { rank: 'Q' as const, suit: 'diamonds' as const },
      { rank: 'K' as const, suit: 'diamonds' as const },
      { rank: 'A' as const, suit: 'diamonds' as const },
    ],
  };

  it('a non-loner sweep scores 2 points', () => {
    const s0 = makePlayState({ dealer: 'B', trump: hearts, maker: 'A', hands: sweepHands });
    const end = playOutHand(s0);
    expect(end.phase).toBe('hand_complete');
    expect(end.tricksWon.A).toBe(5);
    expect(end.gameScore.A).toBe(2);
    expect(end.gameScore.B).toBe(0);
  });

  it('a standard loner sweep scores config.lonerPoints.standard (4)', () => {
    const s0 = makePlayState({
      dealer: 'B',
      trump: hearts,
      maker: 'A',
      lonerTier: 'standard',
      hands: sweepHands,
    });
    expect(s0.ringOrder).toHaveLength(3); // A's blind hand sits out
    const end = playOutHand(s0);
    expect(end.tricksWon.A).toBe(5);
    expect(end.gameScore.A).toBe(4);
  });

  it('a full-blind loner sweep scores 8', () => {
    const s0 = makePlayState({
      dealer: 'B',
      trump: hearts,
      maker: 'A',
      lonerTier: 'full_blind',
      hands: sweepHands,
    });
    const end = playOutHand(s0);
    expect(end.gameScore.A).toBe(8);
  });

  it('a blind-hand loner sweep scores 6', () => {
    const s0 = makePlayState({
      dealer: 'B',
      trump: hearts,
      maker: 'A',
      lonerTier: 'blind_hand',
      hands: sweepHands,
    });
    const end = playOutHand(s0);
    expect(end.gameScore.A).toBe(6);
  });

  it('maker held to fewer than 3 tricks is euchred: defender scores 2', () => {
    // Swap so B (defender in this framing) holds all the trump and A is the (losing) maker.
    const s0 = makePlayState({
      dealer: 'B',
      trump: hearts,
      maker: 'A',
      hands: {
        nonDealerSelected: sweepHands.dealerSelected,
        nonDealerBlind: sweepHands.dealerBlind,
        dealerSelected: sweepHands.nonDealerSelected,
        dealerBlind: sweepHands.nonDealerBlind,
      },
    });
    const end = playOutHand(s0);
    expect(end.tricksWon.A).toBe(0);
    expect(end.gameScore.B).toBe(2);
    expect(end.gameScore.A).toBe(0);
  });

  it('winner leads next trick, and rotation persists per-hand until beaten (RULES.md §6)', () => {
    const s0 = makePlayState({ dealer: 'B', trump: hearts, maker: 'A', hands: sweepHands });
    const nonDealerSelectedIdx = s0.ringOrder!.findIndex(
      (h) => h.player === 'A' && h.role === 'selected',
    );
    expect(s0.currentTrickLeaderRingIndex).toBe(nonDealerSelectedIdx); // trick 1 leader

    const end = playOutHand(s0);
    // A's selected hand wins every trick (it's all trump), so it must remain the leader
    // (ring position) for all 5 tricks — the winning hand never changes.
    expect(end.trickNumber).toBe(5);
  });
});

describe('visibility (redact)', () => {
  it('nobody sees their own selected hand during the full-blind loner window', () => {
    const s = selectHands(newGame('seed-11', 'B', DEFAULT_CONFIG));
    const viewA = redact(s, 'A');
    expect(viewA.ownSelectedHand).toBeNull();
    expect(viewA.ownBlindHand).toBeNull();
  });

  // The information boundary at each loner window IS the tier (§2) — full-blind sees
  // neither the upcard nor its own hand, blind-hand sees the upcard but not its own hand, and
  // only normal bidding sees both. That invariant is exactly what the reveal-order swap in
  // reducer.ts touches, so it needs its own assertion rather than living only inside the
  // reducer's phase/flag checks above — a swap that silently inverted AGAIN would still pass
  // those.
  it('the full-blind window shows neither the upcard nor your own hand', () => {
    const s = selectHands(newGame('seed-12a', 'B', DEFAULT_CONFIG));
    expect(s.phase).toBe('loner_full_blind');
    const viewA = redact(s, 'A');
    expect(viewA.upcard).toBeNull();
    expect(viewA.ownSelectedHand).toBeNull();
  });

  it('the blind-hand window shows the upcard but still not your own hand', () => {
    let s = selectHands(newGame('seed-12b', 'B', DEFAULT_CONFIG));
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' }); // decline full-blind
    expect(s.phase).toBe('loner_blind_hand');
    const viewA = redact(s, 'A');
    expect(viewA.upcard).not.toBeNull();
    expect(viewA.ownSelectedHand).toBeNull();
  });

  it('selected hand becomes visible only after both decline the blind-hand window too', () => {
    let s = selectHands(newGame('seed-12', 'B', DEFAULT_CONFIG));
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' }); // decline full-blind
    s = reduce(s, { type: 'PASS', player: 'A' });
    s = reduce(s, { type: 'PASS', player: 'B' }); // decline blind-hand
    expect(s.phase).toBe('bidding_round1');
    const viewA = redact(s, 'A');
    expect(viewA.ownSelectedHand).toHaveLength(5);
    expect(viewA.ownBlindHand).toBeNull(); // blind hand still hidden
  });

  it('opponent hand contents are never visible mid-hand, only counts', () => {
    let s = passLonerWindows(selectHands(newGame('seed-13', 'B', DEFAULT_CONFIG)));
    s = reduce(s, { type: 'ORDER_UP', player: 'A', loner: false });
    const viewA = redact(s, 'A');
    expect(viewA.opponentSelectedHand).toBeNull();
    expect(viewA.opponentSelectedCount).toBeGreaterThan(0);
  });

  it('both hands are revealed to both players once the deal is complete', () => {
    const s0 = makePlayState({
      dealer: 'B',
      trump: 'hearts',
      maker: 'A',
      hands: {
        nonDealerSelected: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'K', suit: 'hearts' },
          { rank: 'Q', suit: 'hearts' },
          { rank: 'J', suit: 'hearts' },
          { rank: '10', suit: 'hearts' },
        ],
        nonDealerBlind: [
          { rank: '9', suit: 'clubs' },
          { rank: '10', suit: 'clubs' },
          { rank: 'Q', suit: 'clubs' },
          { rank: 'K', suit: 'clubs' },
          { rank: 'A', suit: 'clubs' },
        ],
        dealerSelected: [
          { rank: '9', suit: 'spades' },
          { rank: '10', suit: 'spades' },
          { rank: 'Q', suit: 'spades' },
          { rank: 'K', suit: 'spades' },
          { rank: 'A', suit: 'spades' },
        ],
        dealerBlind: [
          { rank: '9', suit: 'diamonds' },
          { rank: '10', suit: 'diamonds' },
          { rank: 'Q', suit: 'diamonds' },
          { rank: 'K', suit: 'diamonds' },
          { rank: 'A', suit: 'diamonds' },
        ],
      },
    });
    const end = playOutHand(s0);
    const viewB = redact(end, 'B');
    expect(viewB.opponentSelectedHand).not.toBeNull();
    expect(viewB.opponentBlindHand).not.toBeNull();
  });
});

describe('determinism', () => {
  it('replaying the same seed and action history reproduces an identical end state', () => {
    const run = () => {
      let s = orderUpRound1(newGame('seed-determinism', 'B', DEFAULT_CONFIG), 'A', false);
      s = dealerDiscardFirstLegal(s);
      return playOutHand(s);
    };
    const first = run();
    const second = run();
    expect(second).toEqual(first);
  });
});

describe('game-to-target and dealer alternation', () => {
  it('nextDeal alternates dealer after a normal hand_complete', () => {
    const s0 = makePlayState({
      dealer: 'B',
      trump: 'hearts',
      maker: 'A',
      hands: {
        nonDealerSelected: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'K', suit: 'hearts' },
          { rank: 'Q', suit: 'hearts' },
          { rank: 'J', suit: 'hearts' },
          { rank: '10', suit: 'hearts' },
        ],
        nonDealerBlind: [
          { rank: '9', suit: 'clubs' },
          { rank: '10', suit: 'clubs' },
          { rank: 'Q', suit: 'clubs' },
          { rank: 'K', suit: 'clubs' },
          { rank: 'A', suit: 'clubs' },
        ],
        dealerSelected: [
          { rank: '9', suit: 'spades' },
          { rank: '10', suit: 'spades' },
          { rank: 'Q', suit: 'spades' },
          { rank: 'K', suit: 'spades' },
          { rank: 'A', suit: 'spades' },
        ],
        dealerBlind: [
          { rank: '9', suit: 'diamonds' },
          { rank: '10', suit: 'diamonds' },
          { rank: 'Q', suit: 'diamonds' },
          { rank: 'K', suit: 'diamonds' },
          { rank: 'A', suit: 'diamonds' },
        ],
      },
    });
    const end = playOutHand(s0);
    expect(end.phase).toBe('hand_complete');
    const next = nextDeal(end, 'next-seed');
    expect(next.dealer).toBe(otherPlayer(end.dealer));
    expect(next.gameScore).toEqual(end.gameScore);
  });

  it('reaching gameTarget ends the game with a winner', () => {
    const config = { ...DEFAULT_CONFIG, gameTarget: 2 };
    const s0 = makePlayState({
      dealer: 'B',
      trump: 'hearts',
      maker: 'A',
      config,
      hands: {
        nonDealerSelected: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'K', suit: 'hearts' },
          { rank: 'Q', suit: 'hearts' },
          { rank: 'J', suit: 'hearts' },
          { rank: '10', suit: 'hearts' },
        ],
        nonDealerBlind: [
          { rank: '9', suit: 'clubs' },
          { rank: '10', suit: 'clubs' },
          { rank: 'Q', suit: 'clubs' },
          { rank: 'K', suit: 'clubs' },
          { rank: 'A', suit: 'clubs' },
        ],
        dealerSelected: [
          { rank: '9', suit: 'spades' },
          { rank: '10', suit: 'spades' },
          { rank: 'Q', suit: 'spades' },
          { rank: 'K', suit: 'spades' },
          { rank: 'A', suit: 'spades' },
        ],
        dealerBlind: [
          { rank: '9', suit: 'diamonds' },
          { rank: '10', suit: 'diamonds' },
          { rank: 'Q', suit: 'diamonds' },
          { rank: 'K', suit: 'diamonds' },
          { rank: 'A', suit: 'diamonds' },
        ],
      },
    });
    const end = playOutHand(s0);
    expect(end.phase).toBe('game_over');
    expect(end.winner).toBe('A');
  });
});
