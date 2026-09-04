import type { Player, PlayerView, Suit } from '../../shared/engine/types.ts';
import { otherPlayer } from '../../shared/engine/legal.ts';

// Each player's scoring suit — a fixed choice for now (real euchre lets a player pick their
// own suit for this; that becomes a settings option later, not part of the core rules).
const SCORE_SUIT: Record<Player, Suit> = { A: 'hearts', B: 'spades' };

/** The 4-and-6 scoring ritual, TWO-PHASE — re-derived from 10 reference photos of real cards
 *  being physically overlapped (see the design history; the mockup that verified every number
 *  below is archived alongside it). This replaces an EARLIER version of this same ritual
 *  (`coveredClipPath`, a single 2-column grid with an L-shaped clip-path reveal) that was
 *  invented from a description rather than measured against the photos, and read as "peeling"
 *  rather than as one card overlapping another.
 *
 *  **Phase A (score 0-6): the 6 is the counting card.** A plain card BACK covers it and peels
 *  off, one pip at a time, in reading order (top-left first, then across, then down).
 *
 *  **Phase B (score 7-10): the 6 is spent — fully revealed, no longer counting — and IT
 *  becomes the cover**, sliding off the 4 the same way the back did. This is the mechanic the
 *  photos actually show: never three cards on the table, only ever two, and the SAME physical
 *  motion (a whole card, tilted, sliding away) both times.
 *
 *  **The tilt is not decorative.** A cover that never rotates can only ever expose a whole row
 *  at a time off a 2-column pip grid — reaching an ODD pip count requires bisecting a row,
 *  which requires a real diagonal. Measuring the photos directly (PCA on each one's card
 *  silhouette, corrected for a camera EXIF-orientation bug that cost several wrong passes
 *  before it was found) turned up a clean mechanical rule: every EVEN reveal sits flat
 *  (~0deg), every ODD reveal tilts to the same ~48deg — one physical card being slid off,
 *  which cannot lean a different way partway up the same score. */

type CoverTransform = { dx: number; dy: number; rot: number; scale: number };

// Every value below reproduces EXACTLY the stated number of the target card's pips exposed —
// confirmed by rendering each keyframe to an offscreen canvas and sampling the actual pixel at
// every pip position, not derived by hand. (`dx`/`dy` are fractions of the CARD's own width/
// height, applied as a translate before rotating/scaling around the card's own centre — see
// `coverStyle` below. `scale` is a small oversize: a same-size tilted rectangle pivoted around
// its own centre cannot fully cover an axis-aligned same-size rectangle from every angle, so
// each tilted keyframe is drawn slightly larger to close that gap.)
const PHASE_A_TRANSFORM: Record<number, CoverTransform> = {
  0: { dx: 0, dy: 0, rot: 0, scale: 1.0 },
  1: { dx: 0.13673, dy: 0.15186, rot: 48, scale: 1.12 },
  2: { dx: 0, dy: 0.41041, rot: 0, scale: 1.12 },
  3: { dx: 0.30779, dy: 0.34184, rot: 48, scale: 1.12 },
  4: { dx: 0, dy: 0.71041, rot: 0, scale: 1.12 },
  5: { dx: 0.47886, dy: 0.53182, rot: 48, scale: 1.12 },
  // The one true "parked" resting spot — the back is genuinely gone, not just slid far enough
  // to look gone. A straight slide that clears the far pip column necessarily clears the near
  // one too, so every OTHER "fully clear" look above is achieved by covering exactly one row,
  // not by literally separating (see PHASE_A_TRANSFORM[2]/[4], which are flat, not parked).
  6: { dx: 0.85, dy: -0.16, rot: -6, scale: 1.06 },
};
const PHASE_B_TRANSFORM: Record<number, CoverTransform> = {
  // Score 6 exactly: the 6 is fully exposed (nothing covering it — see ScorePair below, this
  // transform never applies to the 6 itself), and the 4 is just arriving, peeking out from
  // behind at a small, flat, LEFT-shifted offset — a stack, not two cards side by side (that
  // composition is reserved for score 10, the actual win).
  0: { dx: -0.13, dy: -0.035, rot: 0, scale: 1.06 },
  1: { dx: 0.19375, dy: 0.21519, rot: 48, scale: 1.12 },
  2: { dx: 0, dy: 0.56041, rot: 0, scale: 1.12 },
  3: { dx: 0.42197, dy: 0.46865, rot: 48, scale: 1.12 },
  // The win: both cards fully spent, parked cleanly apart — not just another keyframe, so it
  // gets a clean flat separation rather than a hand-picked resting angle like [6] above does.
  4: { dx: 1.18, dy: 0, rot: 0, scale: 1.06 },
};

// `.score-pair` (the frame) has `overflow: visible` (see index.css), so a tilted cover
// swinging past this box's own edges is never clipped — the box's size only controls how much
// room `.score-slot`'s flex layout reserves, not what's visually allowed to paint. It was
// first sized to the union of all 11 keyframes' rendered extents (80x88), which was correct
// but unnecessarily generous: that made `.score-slot` tall enough to collide with the wall
// picture/clock at wide viewports (`npm run audit`'s chrome-collision check). Shrunk back to
// CARD size plus the same 12au margin CARD_OX/OY already use on the top-left — the anchor's
// own position doesn't move, only the invisible bottom-right slack does.
const FRAME_W = 54;
const FRAME_H = 66;
const CARD_OX = 12;
const CARD_OY = 12;
const CARD_W = 30;
const CARD_H = 42;

/** Positions an oversized, tilted card centred on the BASE card's own centre — `dx`/`dy` are
 *  fractions of the card's own size, matching the calibration above exactly. CSS applies
 *  `translate` first (moving the element's centre in the PARENT's untransformed space), then
 *  `rotate`/`scale` around that new centre (the default `transform-origin`) — the same
 *  composition the mockup's `ctx.translate → ctx.rotate → drawImage(oversized, centred)` used. */
function coverStyle(t: CoverTransform): React.CSSProperties {
  return {
    transform:
      `translate(calc(${t.dx} * ${CARD_W}px * var(--px)), calc(${t.dy} * ${CARD_H}px * var(--px))) ` +
      `rotate(${t.rot}deg) scale(${t.scale})`,
  };
}

function ScoreCardImg({
  src,
  className,
  style,
}: {
  src: string;
  className: string;
  style?: React.CSSProperties;
}) {
  return <img className={`score-card-img ${className}`} src={src} alt="" style={style} />;
}

/** Score 0-10 for one player, split across the two cards per the two-phase ritual documented
 *  above: the 6 counts 0-6 under a sliding back, then the spent 6 itself covers the 4 for 7-10.
 *  `player`'s own win (`view.winner === player`) gets a small gold glow on both cards — the
 *  actual "you won" text already lives in StatusBanner; this is just the scoreboard's own
 *  quiet acknowledgement, not a duplicate announcement. */
function ScorePair({ player, score, won }: { player: Player; score: number; won: boolean }) {
  const suit = SCORE_SUIT[player];
  const sixSrc = `/art/scoreboard/${suit}_6.png`;
  const fourSrc = `/art/scoreboard/${suit}_4.png`;
  const backSrc = '/art/score_card_back.png';

  const anchorStyle: React.CSSProperties = {
    left: `calc(${CARD_OX}px * var(--px))`,
    top: `calc(${CARD_OY}px * var(--px))`,
    width: `calc(${CARD_W}px * var(--px))`,
    height: `calc(${CARD_H}px * var(--px))`,
  };

  let layers: React.ReactNode;
  if (score < 6) {
    // Phase A: the 6 counts, a back cover peels off it.
    const t = PHASE_A_TRANSFORM[score]!;
    layers = (
      <>
        <ScoreCardImg src={sixSrc} className="score-card-base" />
        <ScoreCardImg src={backSrc} className="score-card-cover" style={coverStyle(t)} />
      </>
    );
  } else if (score === 6) {
    // The exact transition: 6 fully exposed (no cover at all), 4 only just arriving.
    const t = PHASE_B_TRANSFORM[0]!;
    layers = (
      <>
        <ScoreCardImg src={fourSrc} className="score-card-cover" style={coverStyle(t)} />
        <ScoreCardImg src={sixSrc} className="score-card-base" />
      </>
    );
  } else {
    // Phase B: the 4 counts, the now-spent 6 itself is the cover.
    const t = PHASE_B_TRANSFORM[score - 6]!;
    layers = (
      <>
        <ScoreCardImg src={fourSrc} className="score-card-base" />
        <ScoreCardImg src={sixSrc} className="score-card-cover" style={coverStyle(t)} />
      </>
    );
  }

  const frameStyle: React.CSSProperties = {
    width: `calc(${FRAME_W}px * var(--px))`,
    height: `calc(${FRAME_H}px * var(--px))`,
  };

  return (
    <div className="score-pair" style={frameStyle}>
      <div className={`score-card-anchor${won ? ' is-won' : ''}`} style={anchorStyle}>
        {layers}
      </div>
    </div>
  );
}

/** No portrait here any more. It was the Old-Timer's face in the corner of the scoreboard,
 *  which made sense while he was absent from the table — but he now sits across it (2f.3,
 *  Table.tsx), reacting with the same `useOpponentExpression` states, so the portrait was
 *  literally a second copy of the same man on the same screen. */
export function Scoreboard({ view }: { view: PlayerView }) {
  // Relative to the viewer, not to seat 'A' — see seatsFor() in Table.tsx.
  const you = view.you;
  const them = otherPlayer(you);
  return (
    <div className="scoreboard">
      <div className={`score-slot${view.dealer === you ? ' is-dealer' : ''}`}>
        <div className="score-text">
          <span className="score-label">You</span>
          <span className="score-number">{view.gameScore[you]}</span>
        </div>
        <ScorePair player={you} score={view.gameScore[you]} won={view.winner === you} />
      </div>
      <div className={`score-slot${view.dealer === them ? ' is-dealer' : ''}`}>
        <ScorePair player={them} score={view.gameScore[them]} won={view.winner === them} />
        <div className="score-text">
          <span className="score-label">Old-Timer</span>
          <span className="score-number">{view.gameScore[them]}</span>
        </div>

      </div>
    </div>
  );
}
