import type { LonerTier, PlayerView } from '../../shared/engine/types.ts';
import { useLonerStamp } from '../game/useLonerStamp.ts';

const STAMP_TEXT: Record<LonerTier, string> = {
  standard: 'GOING ALONE',
  blind_hand: 'ALONE — BLIND HAND',
  full_blind: 'ALONE — FULL BLIND',
};

/** The loner ladder's visual language (Phase 2 design spec §8): each tier is a bigger bet on
 *  less information, and the room should teach that without a tutorial.
 *
 *    - standard   — a firm stamp with a red glow. One-shot.
 *    - blind_hand — the same stamp, cooler/dimmer, PLUS the room dims for the rest of the
 *                   hand: playing without having looked at your own cards is a real loss of
 *                   footing, and the room says so.
 *    - full_blind — the biggest flourish, and ambience is cut almost entirely — "drops to
 *                   firelight only" — for the whole hand. Zero information in, zero light out.
 *
 *  Two independent pieces, both driven by the same `view.lonerTier`:
 *    1. `LonerStamp` — the one-shot text flourish at the moment of declaration.
 *    2. `LonerDim`   — the SUSTAINED overlay for as long as that tier's hand is in play.
 *  Split because they have different lifetimes, not because they're unrelated — kept in one
 *  file since they're two faces of the same design idea and are always used together. */
export function LonerStamp({ view }: { view: PlayerView }) {
  const stamp = useLonerStamp(view);
  if (!stamp) return null;
  return (
    <div className={`loner-stamp loner-stamp-${stamp}`} aria-hidden="true">
      {STAMP_TEXT[stamp]}
    </div>
  );
}

export function LonerDim({ view }: { view: PlayerView }) {
  if (!view.lonerTier || view.lonerTier === 'standard') return null;
  return <div className={`loner-dim loner-dim-${view.lonerTier}`} aria-hidden="true" />;
}
