/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, PlayerView } from '../shared/engine/types.ts';
import { useOpponentSpeech } from '../src/game/useOpponentSpeech.ts';

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: 'A',
    phase: 'bidding_round1',
    dealer: 'A',
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: null,
    ownBlindHand: null,
    opponentSelectedCount: 5,
    opponentBlindCount: 5,
    opponentSelectedHand: null,
    opponentBlindHand: null,
    upcard: null,
    turnedDownSuit: null,
    trump: null,
    maker: null,
    lonerTier: null,
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 1,
    actingHand: null,
    ...overrides,
  };
}

/** Direct user feedback: "i want the old man to say pass when they pass, pick it up when he
 *  calls trump... funny things periodically, or after a good hand." Pinned deterministically
 *  here (rather than trusted to a live playthrough) because both triggers this hook reacts to
 *  are inherently probabilistic or timing-sensitive — a live driver catches the mechanism only
 *  by luck, which is exactly what made an earlier live check of the 'select' idle-banter path
 *  inconclusive (see the session history: several minutes of manual clicking through bidding
 *  rounds never definitively proved the branch, while this test does in under a second). */
describe('useOpponentSpeech', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // Forces every probability gate (`Math.random() < 0.25/0.45`) to pass and every `pick()`
    // to land on the first pool entry, so the test asserts the exact mechanism, not a coin
    // flip. `pick()`'s own no-immediate-repeat filter never removes the first entry unless it
    // IS the previous line, which none of these tests set up.
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('says something when the bot passes', () => {
    const view = makeView();
    const action: Action = { type: 'PASS', player: 'B' };
    const { result, rerender } = renderHook(
      ({ view, action }) => useOpponentSpeech(view, action),
      { initialProps: { view, action: null as Action | null } },
    );
    expect(result.current).toBeNull();
    rerender({ view, action });
    expect(result.current).not.toBeNull();
    expect(result.current).toMatch(/pass/i);
  });

  it('says something order-up-flavoured when the bot orders up (not alone)', () => {
    const view = makeView();
    const action: Action = { type: 'ORDER_UP', player: 'B' };
    const { result, rerender } = renderHook(
      ({ view, action }) => useOpponentSpeech(view, action),
      { initialProps: { view, action: null as Action | null } },
    );
    rerender({ view, action });
    expect(result.current).toMatch(/pick it up|that'll do|i'll take/i);
  });

  it('names the actual suit when the bot calls trump', () => {
    const view = makeView();
    const action: Action = { type: 'NAME_TRUMP', player: 'B', suit: 'hearts' };
    const { result, rerender } = renderHook(
      ({ view, action }) => useOpponentSpeech(view, action),
      { initialProps: { view, action: null as Action | null } },
    );
    rerender({ view, action });
    expect(result.current).toMatch(/hearts/i);
  });

  it('reacts to winning a hand once phase reaches hand_complete', () => {
    const playing = makeView({ phase: 'play', tricksWon: { A: 1, B: 2 } });
    const complete = makeView({ phase: 'hand_complete', tricksWon: { A: 1, B: 3 } });
    const { result, rerender } = renderHook(
      ({ view }) => useOpponentSpeech(view, null),
      { initialProps: { view: playing } },
    );
    expect(result.current).toBeNull();
    rerender({ view: complete });
    expect(result.current).not.toBeNull();
  });

  it('reacts to losing the GAME (not just a hand) with a game-over line', () => {
    const playing = makeView({ phase: 'play', tricksWon: { A: 3, B: 2 } });
    const gameOver = makeView({ phase: 'game_over', winner: 'A', gameScore: { A: 10, B: 6 } });
    const { result, rerender } = renderHook(
      ({ view }) => useOpponentSpeech(view, null),
      { initialProps: { view: playing } },
    );
    rerender({ view: gameOver });
    expect(result.current).not.toBeNull();
    expect(result.current).toMatch(/too old|earned|head/i);
  });

  it('offers idle banter on entering a fresh select phase', () => {
    const complete = makeView({ phase: 'hand_complete' });
    const select = makeView({ phase: 'select' });
    const { result, rerender } = renderHook(
      ({ view }) => useOpponentSpeech(view, null),
      { initialProps: { view: complete } },
    );
    rerender({ view: select });
    expect(result.current).not.toBeNull();
  });

  it('clears the line after its own timeout', () => {
    const view = makeView();
    const action: Action = { type: 'PASS', player: 'B' };
    const { result, rerender } = renderHook(
      ({ view, action }) => useOpponentSpeech(view, action),
      { initialProps: { view, action: null as Action | null } },
    );
    rerender({ view, action });
    expect(result.current).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBeNull();
  });
});

/** The lines in this file are the Old-Timer's voice. Online the opponent is a PERSON, and
 *  putting his catchphrases in their mouth is worse than saying nothing — "Mai" was delivering
 *  "This chair's older than you."
 *
 *  Passing `lastBotAction: null` was not enough, which is the bug these cover: that only
 *  silences the bid reactions, which read it directly. The phase-driven effect never consulted
 *  it, so idle banter still fired on `select` (25%), hand reactions at 45%, and the game-over
 *  line every time. `Math.random` is stubbed to 0 here so the probabilistic paths fire
 *  deterministically rather than passing by luck. */
describe('a human opponent never speaks the bot\'s lines', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('stays silent through the phase that carries idle banter', () => {
    const { result, rerender } = renderHook(
      ({ view }) => useOpponentSpeech(view, null, false),
      { initialProps: { view: makeView({ phase: 'bidding_round1' }) } },
    );
    rerender({ view: makeView({ phase: 'select' }) });
    expect(result.current).toBeNull();
  });

  it('stays silent at game over, which always speaks for a bot', () => {
    const { result, rerender } = renderHook(
      ({ view }) => useOpponentSpeech(view, null, false),
      { initialProps: { view: makeView({ phase: 'play' }) } },
    );
    rerender({ view: makeView({ phase: 'game_over', winner: 'B' }) });
    expect(result.current).toBeNull();
  });

  it('but a BOT opponent still does speak, so the gate is the flag and not a silenced hook', () => {
    const { result, rerender } = renderHook(
      ({ view }) => useOpponentSpeech(view, null, true),
      { initialProps: { view: makeView({ phase: 'play' }) } },
    );
    rerender({ view: makeView({ phase: 'game_over', winner: 'B' }) });
    expect(result.current).not.toBeNull();
  });
});
