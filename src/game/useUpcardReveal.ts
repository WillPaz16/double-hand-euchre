import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../../shared/engine/types.ts';

const WHEEL_MS = 500;

/** Drives the upcard's "slot-machine wheel" set piece (Phase 2 design spec §8): the moment
 *  the upcard flips face-up, four suits blur past before clacking onto the real one. It's the
 *  one genuinely random reveal in the game, which is exactly what a randomizer animation is
 *  for — naming trump later gets a stamp instead, since a wheel would misrepresent a choice
 *  as chance.
 *
 *  Derived purely from watching `view.upcard` transition from null to non-null, same pattern
 *  as `useOpponentExpression` — no new engine state. `upcard` only ever makes that one
 *  transition per deal (RULES.md: turned once, buried once trump is named), so there's no
 *  risk of it firing again mid-hand. */
export function useUpcardReveal(view: PlayerView): boolean {
  const [spinning, setSpinning] = useState(false);
  const hadUpcard = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const has = view.upcard !== null;
    if (has && !hadUpcard.current) {
      setSpinning(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSpinning(false), WHEEL_MS);
    }
    hadUpcard.current = has;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.upcard]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return spinning;
}
