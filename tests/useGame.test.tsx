/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Action } from '../shared/engine/types.ts';
import { useGame, TRICK_HOLD_MS, BOT_DELAY_MAX_MS } from '../src/game/useGame.ts';

/** Tests for the React timing layer — effect lifetimes, the bot's turn timer, and the
 *  freeze that holds a finished trick on the table.
 *
 *  This layer had NO automated coverage until a hard deadlock shipped: one mistimed click
 *  during a trick sweep froze the game permanently. The 40 engine tests could never have
 *  caught it, because the engine was entirely correct — the defect was purely in effect
 *  lifetime and freeze ordering. Everything here is deliberately about *timing and
 *  transitions*, not rules; rules belong in the engine suite.
 *
 *  Every test passes a FIXED SEED to useGame. Without one the deal is random, and which
 *  player wins a given trick decides whether the human even has a legal move during the sweep
 *  hold — which is exactly the condition the deadlock test needs. Left unseeded, these tests
 *  pass or fail depending on the shuffle. They still never assert on specific cards, only on
 *  timing and transitions. */
// Verified to give the HUMAN a legal play during the very FIRST trick hold — i.e. they won
// that trick and lead next. That is the only situation in which the deadlock can fire, so a
// seed lacking it makes the regression test vacuous.
//
// It must land in the FIRST hand: `nextDeal` draws a fresh random seed, so determinism only
// holds for one hand. An earlier candidate seed put the human's first win in hand two and
// the test was therefore non-deterministic despite being "seeded".
const SEED = 's3';

/** WHAT THESE TESTS DO AND DON'T COVER — verified by reintroducing each cause separately.
 *
 *  The deadlock had two causes:
 *    (1) capture and release shared one effect keyed on [state], so ANY state change during
 *        a hold cancelled the release timer and it was never rearmed;
 *    (2) `play()` had no freeze guard, so a human click during the hold reached setState.
 *
 *  Reintroducing (2) alone fails a test here. Reintroducing (1) alone fails NOTHING — because
 *  with the guard in place nothing can change `state` during a hold, so (1) is unreachable.
 *  All three setState sites in useGame (nextDeal, the bot's move, and play) sit behind an
 *  `if (completedTrick) return`.
 *
 *  So the guard is the load-bearing fix and these tests protect it. Splitting the effects is
 *  defence-in-depth against a latent hazard: the day someone adds a fourth setState path that
 *  runs during a hold, the split is what stops the deadlock returning. That path does not
 *  exist today, which is exactly why it cannot be tested today — worth knowing rather than
 *  assuming the suite covers both. */

// Comfortably past the bot's turn delay without reaching TRICK_HOLD_MS, so bot turns can be
// advanced without accidentally releasing a trick hold. Derived from the delay's own upper
// bound rather than hardcoded: the delay is a RANGE (it varies per move so the Old-Timer
// doesn't move like a metronome), and a literal here would be a second, silent copy of its
// maximum that a retune of the range would quietly invalidate.
const BOT_STEP_MS = BOT_DELAY_MAX_MS + 50;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

type Game = ReturnType<typeof useGame>;

/** Advances the game until the human has a card to play, letting the bot take its turns.
 *  Returns false if it never got there (so tests fail loudly rather than silently passing). */
function driveToPlayPhase(get: () => Game): boolean {
  for (let i = 0; i < 60; i++) {
    const g = get();
    if (g.legal.some((a) => a.type === 'PLAY_CARD')) return true;
    const next = g.legal[0];
    if (next && !g.frozen) {
      act(() => {
        g.play(next);
      });
    } else {
      advance(BOT_STEP_MS);
    }
  }
  return false;
}

/** Plays on until a trick completes and is being held for the sweep. */
function driveToHeldTrick(get: () => Game): boolean {
  for (let i = 0; i < 60; i++) {
    if (get().completedTrick) return true;
    const g = get();
    const card = g.legal.find((a) => a.type === 'PLAY_CARD');
    if (card && !g.frozen) {
      act(() => {
        g.play(card);
      });
    } else {
      advance(BOT_STEP_MS);
    }
  }
  return false;
}

describe('useGame — timing and freeze behaviour', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds a completed trick so the winning card is actually visible', () => {
    // Regression: reduce() appends the final card and clears currentTrick in the SAME call,
    // so a complete trick never exists in committed state. Without the UI capturing it, the
    // card that WON each trick was never rendered — you could not see what beat you.
    const { result } = renderHook(() => useGame(SEED));
    expect(driveToPlayPhase(() => result.current)).toBe(true);
    expect(driveToHeldTrick(() => result.current)).toBe(true);

    const held = result.current.completedTrick!;
    expect(held.cards.length).toBeGreaterThanOrEqual(3);
    expect(held.winningIndex).toBeGreaterThanOrEqual(0);
    expect(held.winningIndex).toBeLessThan(held.cards.length);
    expect(['A', 'B']).toContain(held.winner);
  });

  it('releases the freeze after the hold elapses', () => {
    const { result } = renderHook(() => useGame(SEED));
    expect(driveToPlayPhase(() => result.current)).toBe(true);
    expect(driveToHeldTrick(() => result.current)).toBe(true);
    expect(result.current.frozen).toBe(true);

    advance(TRICK_HOLD_MS + 50);
    expect(result.current.completedTrick).toBeNull();
    expect(result.current.frozen).toBe(false);
  });

  it('ignores a play attempted while a finished trick is held', () => {
    // Non-vacuous by construction: it hunts for a hold where the human actually HAS a legal
    // play, since a click that was never legal proves nothing about the freeze. (An earlier
    // version guarded with `if (card)` and silently asserted nothing on tricks the bot won.)
    const { result } = renderHook(() => useGame(SEED));
    expect(driveToPlayPhase(() => result.current)).toBe(true);

    let tested = false;
    for (let trick = 0; trick < 12 && !tested; trick++) {
      if (!driveToHeldTrick(() => result.current)) break;
      const card = result.current.legal.find((a) => a.type === 'PLAY_CARD');
      if (card) {
        const before = JSON.stringify(result.current.view);
        act(() => {
          result.current.play(card);
        });
        // The click must not reach the engine while play is frozen.
        expect(JSON.stringify(result.current.view)).toBe(before);
        expect(result.current.frozen).toBe(true);
        tested = true;
      }
      advance(TRICK_HOLD_MS + 200);
    }
    expect(tested).toBe(true);
  });

  it('DEADLOCK REGRESSION: a legal click during the hold must not freeze the game forever', () => {
    // The original bug, exactly. Capture and release both lived in one effect keyed on
    // [state], so its cleanup ran on ANY state change. A human click during the hold changed
    // `state`, cancelling the very timeout that would clear `completedTrick`; the re-run then
    // early-returned without rearming it. Result: permanently frozen — the bot never moved
    // again and no card was ever clickable again.
    //
    // Measured in-browser before the fix: "playable during hold = 3" -> click ->
    // "after 3.5s: playable=0, stillSweeping=4".
    //
    // THE CLICK MUST BE A *LEGAL* ONE. play() feeds setState an updater that returns `s`
    // unchanged for an illegal action, so React bails out, `state` never changes, and the
    // cleanup that caused the deadlock never runs. An earlier version of this test clicked
    // whatever happened to be in `legal` at hold time; on a trick the BOT won that list is
    // empty, so it clicked nothing and passed against the buggy code — a vacuous test. It
    // therefore hunts for a hold where the human genuinely has a legal play (i.e. they won
    // the trick and lead next) and asserts that it found one.
    const { result } = renderHook(() => useGame(SEED));
    expect(driveToPlayPhase(() => result.current)).toBe(true);

    let clickedDuringHold = false;
    for (let trick = 0; trick < 12 && !clickedDuringHold; trick++) {
      if (!driveToHeldTrick(() => result.current)) break;

      const playable = result.current.legal.find((a) => a.type === 'PLAY_CARD');
      if (playable) {
        // A state-change opportunity mid-hold — the exact trigger for the deadlock.
        act(() => {
          result.current.play(playable);
        });
        clickedDuringHold = true;

        advance(TRICK_HOLD_MS + 200);
        expect(result.current.completedTrick).toBeNull();
        expect(result.current.frozen).toBe(false);
      } else {
        // Bot won this one; let the hold lapse and try the next trick.
        advance(TRICK_HOLD_MS + 200);
      }
    }

    // Guards against the test passing vacuously: if we never managed to click during a hold,
    // this asserted nothing about the deadlock at all.
    expect(clickedDuringHold).toBe(true);

    // And the game must genuinely still be playable, not merely un-frozen.
    let progressed = false;
    for (let i = 0; i < 40 && !progressed; i++) {
      const g = result.current;
      if (g.legal.length > 0 && !g.frozen) progressed = true;
      else advance(BOT_STEP_MS);
    }
    expect(progressed).toBe(true);
  });

  it('rejects an illegal action without changing state', () => {
    const { result } = renderHook(() => useGame(SEED));
    const before = JSON.stringify(result.current.view);
    const bogus = { type: 'PLAY_CARD', card: { suit: 'hearts', rank: 'A' } } as Action;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => {
      result.current.play(bogus);
    });
    expect(JSON.stringify(result.current.view)).toBe(before);
    warn.mockRestore();
  });

  it('lets the bot take its turn on a timer without any human input', () => {
    const { result } = renderHook(() => useGame(SEED));
    // Human picks a packet; from there the bot must act on its own.
    const first = result.current.legal[0];
    if (first) {
      act(() => {
        result.current.play(first);
      });
    }
    const before = JSON.stringify(result.current.view);

    let changed = false;
    for (let i = 0; i < 10 && !changed; i++) {
      advance(BOT_STEP_MS);
      changed = JSON.stringify(result.current.view) !== before;
    }
    expect(changed).toBe(true);
  });
});
