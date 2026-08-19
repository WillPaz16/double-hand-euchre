/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Action } from '../shared/engine/types.ts';
import { useGame, TRICK_HOLD_MS, HUMAN, BOT } from '../src/game/useGame.ts';

/** End-to-end gameplay soak for the REACT layer.
 *
 *  The engine already has a 10,000-deal fuzz run (scripts/fuzz.ts) proving no rule
 *  combination reaches an illegal state. This is the equivalent for everything above it: the
 *  hook drives a *complete game to 10* through the real bot, the real timers, and the real
 *  freeze/sweep logic, many times over.
 *
 *  It exists because the class of bug that actually shipped was never a rules bug. It was a
 *  stuck state — one mistimed click froze the game permanently, and nothing in the engine
 *  suite could see it. What this asserts is therefore mostly *liveness*: every game must
 *  finish, no state may ever be un-advanceable, and the freeze must always release. */

const MAX_STEPS = 6000;
const STEP_MS = 700; // clears the bot's turn delay without reaching TRICK_HOLD_MS

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Small deterministic PRNG so each seed explores a different-but-reproducible line of play
 *  rather than always taking legal[0]. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
}

interface Outcome {
  finished: boolean;
  steps: number;
  scores: { A: number; B: number };
  winner: string | null;
  maxFrozenRun: number;
  scoreWentDown: boolean;
}

function playFullGame(seed: string, variant: number): Outcome {
  const { result, unmount } = renderHook(() => useGame(seed));
  const rand = lcg(variant * 7919 + 13);

  let steps = 0;
  let frozenRun = 0;
  let maxFrozenRun = 0;
  let scoreWentDown = false;
  let prevTotal = 0;

  try {
    while (result.current.view.phase !== 'game_over' && steps < MAX_STEPS) {
      const g = result.current;

      const total = g.view.gameScore[HUMAN] + g.view.gameScore[BOT];
      if (total < prevTotal) scoreWentDown = true;
      prevTotal = total;

      if (g.frozen) {
        // A hold must always end. Track the longest run so a stuck freeze is visible in the
        // failure message rather than only as a timeout.
        frozenRun++;
        maxFrozenRun = Math.max(maxFrozenRun, frozenRun);
        advance(TRICK_HOLD_MS + 100);
      } else {
        frozenRun = 0;
        if (g.legal.length > 0) {
          const pick = g.legal[Math.floor(rand() * g.legal.length)] as Action;
          act(() => {
            g.play(pick);
          });
        } else {
          // Nobody can act: the bot or the next-deal timer must be what moves this forward.
          advance(STEP_MS);
        }
      }
      steps++;
    }

    const v = result.current.view;
    return {
      finished: v.phase === 'game_over',
      steps,
      scores: { A: v.gameScore[HUMAN], B: v.gameScore[BOT] },
      winner: v.winner,
      maxFrozenRun,
      scoreWentDown,
    };
  } finally {
    unmount();
  }
}

describe('full-game soak (React layer)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays 24 complete games to 10 with no stuck state', () => {
    const failures: string[] = [];
    const stepCounts: number[] = [];

    for (let i = 0; i < 24; i++) {
      const seed = `soak-${i}`;
      const o = playFullGame(seed, i);
      stepCounts.push(o.steps);

      if (!o.finished) failures.push(`${seed}: never reached game_over in ${o.steps} steps`);
      if (o.scoreWentDown) failures.push(`${seed}: total score decreased`);
      // A game to 10 cannot be won with fewer than 10 points, and no single hand pays more
      // than the 8-point full-blind loner, so a winner can never exceed 17.
      if (o.finished) {
        const top = Math.max(o.scores.A, o.scores.B);
        const low = Math.min(o.scores.A, o.scores.B);
        if (top < 10) failures.push(`${seed}: winner has only ${top}`);
        if (top > 17) failures.push(`${seed}: impossible winning score ${top}`);
        if (low >= 10) failures.push(`${seed}: both players at 10+ (${o.scores.A}/${o.scores.B})`);
        if (!o.winner) failures.push(`${seed}: game_over with no winner recorded`);
      }
    }

    expect(failures).toEqual([]);
    // Sanity on the harness itself: if games were finishing in a handful of steps, the loop
    // would be exiting early for the wrong reason and every assertion above would be hollow.
    const avg = stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length;
    expect(avg).toBeGreaterThan(50);
  });

  it('never leaves the freeze engaged indefinitely', () => {
    // The deadlock's signature: `frozen` stays true forever. One advance past TRICK_HOLD_MS
    // must always clear it, so a run of consecutive frozen observations should never build up.
    const o = playFullGame('soak-freeze', 3);
    expect(o.finished).toBe(true);
    expect(o.maxFrozenRun).toBeLessThanOrEqual(2);
  });

  it('reaches a decisive result rather than stalling near the target', () => {
    const o = playFullGame('soak-endgame', 11);
    expect(o.finished).toBe(true);
    expect(o.winner).not.toBeNull();
    const winnerScore = o.winner === HUMAN ? o.scores.A : o.scores.B;
    expect(winnerScore).toBeGreaterThanOrEqual(10);
  });
});

describe('restart', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a finished game can be played again without a page reload', () => {
    // Found by playing a real game through the DOM: reaching game_over left no way back to a
    // fresh deal. `restart` must clear the held-trick freeze too, or the new game starts
    // frozen and unplayable — the same class of stuck state the deadlock produced.
    const { result } = renderHook(() => useGame('soak-0'));
    const rand = lcg(1);

    for (let i = 0; i < MAX_STEPS && result.current.view.phase !== 'game_over'; i++) {
      const g = result.current;
      if (g.frozen) advance(TRICK_HOLD_MS + 100);
      else if (g.legal.length > 0)
        act(() => {
          g.play(g.legal[Math.floor(rand() * g.legal.length)] as Action);
        });
      else advance(STEP_MS);
    }
    expect(result.current.view.phase).toBe('game_over');

    act(() => {
      result.current.restart();
    });

    const v = result.current.view;
    expect(v.phase).not.toBe('game_over');
    expect(v.winner).toBeNull();
    expect(v.gameScore[HUMAN]).toBe(0);
    expect(v.gameScore[BOT]).toBe(0);
    expect(result.current.frozen).toBe(false);

    // And it must actually be playable, not merely reset.
    let progressed = false;
    for (let i = 0; i < 40 && !progressed; i++) {
      if (result.current.legal.length > 0 && !result.current.frozen) progressed = true;
      else advance(STEP_MS);
    }
    expect(progressed).toBe(true);
  });
});
