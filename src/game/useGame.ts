import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  newGame,
  nextDeal,
  reduce,
  legalActions,
  redact,
} from '../../shared/engine/index.ts';
import type { Action, GameState, Player } from '../../shared/engine/types.ts';
import { chooseMove } from '../../shared/bot/index.ts';

export const HUMAN: Player = 'A';
export const BOT: Player = 'B';

const BOT_DELAY_MS = 600;
const NEXT_DEAL_DELAY_MS = 1500;

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

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
          const action = chooseMove(view, legal);
          return reduce(s, action);
        });
      }, BOT_DELAY_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state]);

  const play = useCallback((action: Action) => {
    setState((s) => {
      const legal = legalActions(s, HUMAN);
      const isLegal = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
      if (!isLegal) {
        console.warn('rejected illegal human action', action);
        return s;
      }
      return reduce(s, action);
    });
  }, []);

  return {
    view: redact(state, HUMAN),
    legal: legalActions(state, HUMAN),
    play,
  };
}
