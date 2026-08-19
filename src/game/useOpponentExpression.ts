import { useEffect, useRef, useState } from 'react';
import type { Player, PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from './useGame.ts';

export type Expression = 'idle' | 'happy' | 'rueful';

const REACTION_MS = 2200;

/** Derives the Old-Timer's portrait expression from game events, purely by watching the
 *  redacted view change — no new engine state needed. Reacts to: winning/losing the trick
 *  just completed, and the overall hand/game result. Reverts to idle after a short beat. */
export function useOpponentExpression(view: PlayerView): Expression {
  const [expression, setExpression] = useState<Expression>('idle');
  const prevTricksRef = useRef<Record<Player, number>>({ A: 0, B: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const react = (next: Expression) => {
    setExpression(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setExpression('idle'), REACTION_MS);
  };

  useEffect(() => {
    const prev = prevTricksRef.current;
    if (view.tricksWon[BOT] > prev[BOT]) react('happy');
    else if (view.tricksWon[HUMAN] > prev[HUMAN]) react('rueful');
    prevTricksRef.current = { A: view.tricksWon[HUMAN], B: view.tricksWon[BOT] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.tricksWon[HUMAN], view.tricksWon[BOT]]);

  useEffect(() => {
    if (view.phase === 'hand_complete' || view.phase === 'game_over') {
      const botWon = view.winner ? view.winner === BOT : view.tricksWon[BOT] > view.tricksWon[HUMAN];
      react(botWon ? 'happy' : 'rueful');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return expression;
}
