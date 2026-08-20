import { useEffect, useRef, useState } from 'react';
import type { LonerTier, PlayerView } from '../../shared/engine/types.ts';

const STAMP_MS = 900;

/** The one-shot flourish for the MOMENT a loner is declared (Phase 2 design spec §8's loner
 *  ladder). Derived purely from `view.lonerTier` transitioning null -> a tier, same
 *  view-diffing pattern as `useOpponentExpression`/`useUpcardReveal` — no new engine state,
 *  and it can't misfire mid-hand because `lonerTier` only ever makes that one transition per
 *  deal (RULES.md §2: declared once, never revoked). */
export function useLonerStamp(view: PlayerView): LonerTier | null {
  const [stamp, setStamp] = useState<LonerTier | null>(null);
  const had = useRef<LonerTier | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (view.lonerTier && !had.current) {
      setStamp(view.lonerTier);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStamp(null), STAMP_MS);
    }
    had.current = view.lonerTier;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.lonerTier]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return stamp;
}
