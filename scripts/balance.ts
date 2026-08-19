/**
 * Positional-balance check: plays complete bot-vs-bot games with the SAME strategy on both
 * seats, varying only who deals the first hand.
 *
 * The question this answers is one the React-layer soak surfaced but cannot settle. With
 * identical strategy, seat A won ~70% of games there — and useGame always makes the human the
 * first dealer, so "seat A" and "dealt first" were confounded. Running both configurations
 * here separates them:
 *
 *   - If the advantage follows the SEAT regardless of who deals first, that is a code bug.
 *   - If it follows the DEALER ROLE, it is a property of the variant (with stick-the-dealer,
 *     the dealer is forced to name trump in round 2, and the non-dealer leads trick one).
 *
 * Deterministic: every game is seeded, so re-running reports identical numbers.
 */
import {
  DEFAULT_CONFIG,
  legalActions,
  newGame,
  nextDeal,
  redact,
  reduce,
} from '../shared/engine/index.ts';
import type { GameState, Player } from '../shared/engine/types.ts';
import { chooseMove } from '../shared/bot/index.ts';

const PLAYERS: Player[] = ['A', 'B'];

function whoseTurn(s: GameState): Player | null {
  for (const p of PLAYERS) if (legalActions(s, p).length > 0) return p;
  return null;
}

function playGame(seed: string, firstDealer: Player): { winner: Player | null; hands: number } {
  let s = newGame(`${seed}-d${firstDealer}`, firstDealer, DEFAULT_CONFIG);
  let hands = 0;

  for (let guard = 0; guard < 20000; guard++) {
    if (s.phase === 'game_over') break;
    if (s.phase === 'hand_complete' || s.phase === 'misdeal') {
      hands++;
      s = nextDeal(s, `${seed}-d${firstDealer}-h${hands}`);
      continue;
    }
    const p = whoseTurn(s);
    if (!p) throw new Error(`stuck: no player has a legal action in phase ${s.phase}`);
    s = reduce(s, chooseMove(redact(s, p), legalActions(s, p)));
  }
  return { winner: s.winner, hands };
}

function run(label: string, firstDealer: Player, games: number) {
  const wins: Record<Player, number> = { A: 0, B: 0 };
  let totalHands = 0;
  for (let i = 0; i < games; i++) {
    const { winner, hands } = playGame(`bal-${i}`, firstDealer);
    if (winner) wins[winner]++;
    totalHands += hands;
  }
  const pct = ((wins.A / games) * 100).toFixed(1);
  console.log(
    `${label.padEnd(22)} A=${String(wins.A).padStart(4)}  B=${String(wins.B).padStart(4)}` +
      `  A win rate ${pct.padStart(5)}%   avg hands/game ${(totalHands / games).toFixed(1)}`,
  );
  return wins.A / games;
}

const GAMES = 500;
console.log(`Positional balance — ${GAMES} games per configuration, identical strategy both seats\n`);
const aDealsFirst = run('A deals first:', 'A', GAMES);
const bDealsFirst = run('B deals first:', 'B', GAMES);

console.log('');
const seatEffect = (aDealsFirst + bDealsFirst) / 2; // A's win rate averaged over both configs
console.log(`Seat A win rate averaged across both dealer configs: ${(seatEffect * 100).toFixed(1)}%`);
console.log(
  'A seat-independent result near 50% means no positional bug; a persistent skew in the same\n' +
    'seat across BOTH configurations would indicate one.',
);
