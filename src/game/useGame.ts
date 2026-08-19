import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  newGame,
  nextDeal,
  reduce,
  legalActions,
  redact,
  actingHand,
  trickWinnerIndex,
} from '../../shared/engine/index.ts';
import type { Action, GameState, Player, TrickCard } from '../../shared/engine/types.ts';
import { chooseMove } from '../../shared/bot/index.ts';

export const HUMAN: Player = 'A';
export const BOT: Player = 'B';

const BOT_DELAY_MS = 600;
const NEXT_DEAL_DELAY_MS = 1500;
/** How long the completed trick stays on the table before the UI drops it. Long enough to
 *  read four cards and see which won; short enough not to stall a five-trick hand.
 *
 *  COUPLED TO `TRICK_HOLD_BEFORE_SWEEP_MS` in Table.tsx (620ms hold + 620ms sweep = 1240ms),
 *  which is why this is 1300 and not a round number. See that constant for the failure modes
 *  if the two drift apart. */
export const TRICK_HOLD_MS = 1300;

/** A trick that has just been won, held by the UI after the engine has already moved on. */
export interface CompletedTrick {
  cards: TrickCard[];
  winner: Player;
  winningIndex: number;
}

function freshSeed(): string {
  return `deal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Drives a full local single-player game: holds engine state, auto-plays the bot's turns
 *  on a short delay, and auto-advances to the next deal once a hand settles. The human's
 *  moves are validated against legalActions() before being applied — the UI cannot submit
 *  an illegal action even if a component bug tries to. */
export function useGame() {
  const [state, setState] = useState<GameState>(() =>
    newGame(freshSeed(), HUMAN, DEFAULT_CONFIG),
  );
  const [completedTrick, setCompletedTrick] = useState<CompletedTrick | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSweepRef = useRef<CompletedTrick | null>(null);

  /** Applies an action and, if it completed a trick, captures that trick for the UI.
   *
   *  This exists because of a real gap between the engine and the screen: `reduce()` appends
   *  the final card and clears `currentTrick` to [] within the SAME call, so a full trick
   *  never exists in committed state and React never renders it. Measured in-browser, the
   *  trick area went 0,1,2,3 → 0 — meaning the card that actually WON the trick was never
   *  visible to the player. That is a playability bug, not just missing polish.
   *
   *  The engine is right and is left alone (its behaviour is what the 40 tests pin down);
   *  reconstructing the completed trick is the UI's job. */
  const applyAction = useCallback((s: GameState, action: Action): GameState => {
    const next = reduce(s, action);
    if (action.type === 'PLAY_CARD' && next.trickNumber > s.trickNumber && s.trump) {
      const hand = actingHand(s);
      if (hand) {
        const cards: TrickCard[] = [...s.currentTrick, { handId: hand, card: action.card }];
        pendingSweepRef.current = {
          cards,
          winner: next.tricksWon[HUMAN] > s.tricksWon[HUMAN] ? HUMAN : BOT,
          winningIndex: trickWinnerIndex(cards, s.trump),
        };
      }
    }
    return next;
  }, []);

  // Promote a captured trick into state, then clear it after the hold. Kept out of the
  // setState updater (which must stay pure) by staging it in a ref first.
  useEffect(() => {
    if (!pendingSweepRef.current) return;
    setCompletedTrick(pendingSweepRef.current);
    pendingSweepRef.current = null;
    const t = setTimeout(() => setCompletedTrick(null), TRICK_HOLD_MS);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Freeze play while a finished trick is on the table, so the next card cannot land on
    // top of one the player is still reading.
    if (completedTrick) return;

    if (state.phase === 'hand_complete' || state.phase === 'misdeal') {
      timerRef.current = setTimeout(() => {
        setState((s) => nextDeal(s, freshSeed()));
      }, NEXT_DEAL_DELAY_MS);
      return;
    }

    if (state.phase === 'game_over') return;

    const botLegal = legalActions(state, BOT);
    if (botLegal.length > 0) {
      timerRef.current = setTimeout(() => {
        setState((s) => {
          const legal = legalActions(s, BOT);
          if (legal.length === 0) return s; // a human move raced ahead of this timer
          const view = redact(s, BOT);
          return applyAction(s, chooseMove(view, legal));
        });
      }, BOT_DELAY_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, completedTrick, applyAction]);

  const play = useCallback(
    (action: Action) => {
      setState((s) => {
        const legal = legalActions(s, HUMAN);
        const isLegal = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
        if (!isLegal) {
          console.warn('rejected illegal human action', action);
          return s;
        }
        return applyAction(s, action);
      });
    },
    [applyAction],
  );

  return {
    view: redact(state, HUMAN),
    legal: legalActions(state, HUMAN),
    play,
    completedTrick,
  };
}
