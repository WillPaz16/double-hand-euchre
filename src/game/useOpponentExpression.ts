import { useEffect, useRef, useState } from 'react';
import type { Player, PlayerView } from '../../shared/engine/types.ts';
import { otherPlayer } from '../../shared/engine/legal.ts';

export type Expression = 'idle' | 'happy' | 'rueful' | 'blink';

const REACTION_MS = 2200;

/** Blink timings (2g.5). Until this, NOTHING in the game with a face ever moved — the only
 *  ambient animation was a four-frame fire and a cat whose "breathing" swells by exactly one
 *  art pixel. A completely still figure staring across the table is the difference between a
 *  character and a cardboard cut-out, and a blink is the cheapest possible fix.
 *
 *  Driven by a timer rather than a CSS sprite sheet on purpose: `steps()` gives every frame an
 *  equal slice, so a 140ms blink every ~5s would need roughly forty near-identical frames to
 *  express as a duty cycle. Two timers and an image swap cost nothing and let the interval be
 *  irregular, which matters — a perfectly metronomic blink reads as a machine. */
const BLINK_MS = 140;
const BLINK_MIN_GAP_MS = 2600;
const BLINK_MAX_GAP_MS = 6200;

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
    if (view.tricksWon[otherPlayer(view.you)] > prev[otherPlayer(view.you)]) react('happy');
    else if (view.tricksWon[view.you] > prev[view.you]) react('rueful');
    prevTricksRef.current = { [view.you]: view.tricksWon[view.you], [otherPlayer(view.you)]: view.tricksWon[otherPlayer(view.you)] } as Record<'A' | 'B', number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.tricksWon[view.you], view.tricksWon[otherPlayer(view.you)]]);

  useEffect(() => {
    if (view.phase === 'hand_complete' || view.phase === 'game_over') {
      const botWon = view.winner ? view.winner === otherPlayer(view.you) : view.tricksWon[otherPlayer(view.you)] > view.tricksWon[view.you];
      react(botWon ? 'happy' : 'rueful');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Blink, but ONLY while idle. A blink layered over a reaction would fight it — `happy` and
  // `rueful` both already redraw the eyes, so swapping to the blink frame mid-reaction would
  // read as the expression glitching rather than as him blinking.
  const [blinking, setBlinking] = useState(false);
  useEffect(() => {
    if (expression !== 'idle') {
      setBlinking(false);
      return;
    }
    let closeTimer: ReturnType<typeof setTimeout>;
    const schedule = (): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        setBlinking(true);
        closeTimer = setTimeout(() => {
          setBlinking(false);
          openTimer = schedule();
        }, BLINK_MS);
        // `Math.random` is banned in `shared/engine` because a game must replay exactly from
        // (seed, actions) — but a blink is presentation, never game state, and nothing here
        // reaches the reducer. Using the seeded RNG for it would make the determinism boundary
        // LESS clear, not more.
      }, BLINK_MIN_GAP_MS + Math.random() * (BLINK_MAX_GAP_MS - BLINK_MIN_GAP_MS));
    let openTimer = schedule();
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  }, [expression]);

  return blinking && expression === 'idle' ? 'blink' : expression;
}
