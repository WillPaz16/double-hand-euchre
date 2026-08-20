/**
 * Plays a large number of full random-but-legal deals through the engine, from deal through
 * hand_complete/misdeal/game_over, asserting the reducer never throws and never reaches an
 * inconsistent state. This is the Phase 1 "done when" check from the build guide.
 */
import { newGame, reduce } from '../shared/engine/reducer.ts';
import { legalActions } from '../shared/engine/legal.ts';
import type { Config, GameState, Player } from '../shared/engine/types.ts';

const TERMINAL_PHASES = new Set(['hand_complete', 'misdeal', 'game_over']);
const MAX_STEPS = 200; // generous ceiling; a real deal finishes in well under 40 actions

function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function playRandomDeal(index: number): GameState {
  const rand = seededRng(`fuzz-${index}`);
  const config: Config = {
    stickTheDealer: rand() < 0.5,
    gameTarget: 10,
    lonerPoints: { standard: 4, blind_hand: 6, full_blind: 8 },
  };
  const dealer: Player = rand() < 0.5 ? 'A' : 'B';
  let s = newGame(`fuzz-deal-${index}`, dealer, config);

  let steps = 0;
  while (!TERMINAL_PHASES.has(s.phase)) {
    steps++;
    if (steps > MAX_STEPS) {
      throw new Error(`stuck in phase ${s.phase} after ${MAX_STEPS} steps (index ${index})`);
    }

    const players: Player[] = ['A', 'B'];
    const actorOptions = players
      .map((p) => ({ player: p, legal: legalActions(s, p) }))
      .filter((x) => x.legal.length > 0);

    if (actorOptions.length === 0) {
      throw new Error(`no legal actions for either player in phase ${s.phase} (index ${index})`);
    }

    const { legal } = pick(actorOptions, rand);
    const action = pick(legal, rand);
    s = reduce(s, action);

    const totalTricks = s.tricksWon.A + s.tricksWon.B;
    if (totalTricks > 5) throw new Error(`impossible trick count ${totalTricks} (index ${index})`);
    if (s.trickNumber > 5) throw new Error(`trickNumber overran 5 (index ${index})`);
  }

  return s;
}

const N = 10_000;
const outcomes: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const end = playRandomDeal(i);
  outcomes[end.phase] = (outcomes[end.phase] ?? 0) + 1;
}

console.log(`✓ ${N} random legal deals completed without error`);
console.log(outcomes);
