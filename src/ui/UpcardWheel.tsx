import type { Suit } from '../../shared/engine/types.ts';

const ORDER: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
// Two full laps plus however far short of a third gets us to the real suit, so the wheel
// always passes every suit at least twice before landing — a wheel that could land after
// seeing only 1-2 suits would read as barely spinning at all.
const LAPS = 2;

/** Two full laps through every suit, then however far short of a third lap lands on the real
 *  one — always ending on `suit` BY CONSTRUCTION (the loop length is derived from `suit`'s own
 *  index), not by appending it afterward, so there's no way for the wheel to land wrong.
 *  Exported for tests/upcardWheel.test.tsx: pinning "always ends on the real suit" and "always
 *  passes every suit at least twice" directly is cheaper and more exhaustive (all 4 suits) than
 *  asserting on rendered CSS animation-delay values. */
export function buildWheelSequence(suit: Suit): Suit[] {
  const targetIndex = ORDER.indexOf(suit);
  const sequence: Suit[] = [];
  for (let i = 0; i < LAPS * ORDER.length + targetIndex + 1; i++) {
    sequence.push(ORDER[i % ORDER.length]!);
  }
  return sequence;
}

/** The upcard's slot-machine reveal (Phase 2 design spec §8): "four suits blur past and clack
 *  onto the upcard's suit." Driven entirely by CSS `animation-delay` on a fixed stack of suit
 *  icons — no JS interval, no sprite-sheet asset needed, just the 4 standalone suit icons
 *  `make_suit_icon()` already generates. Each one flashes in turn; the LAST one in the
 *  sequence is guaranteed to be the real suit (see `buildWheelSequence` above) and its keyframe
 *  holds at full opacity/scale instead of fading, which is the "clack". */
export function UpcardWheel({ suit, durationMs }: { suit: Suit; durationMs: number }) {
  const sequence = buildWheelSequence(suit);
  const stepMs = durationMs / sequence.length;

  return (
    <div className="upcard-wheel">
      {sequence.map((s, i) => (
        <img
          key={i}
          className={`upcard-wheel-frame${i === sequence.length - 1 ? ' is-final' : ''}`}
          src={`/art/suits/${s}.png`}
          alt=""
          style={{ animationDelay: `${i * stepMs}ms`, animationDuration: `${stepMs}ms` }}
        />
      ))}
    </div>
  );
}
