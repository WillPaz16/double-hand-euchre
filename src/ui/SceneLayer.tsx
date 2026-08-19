/** Purely decorative ambient layer sitting behind the game UI.
 *
 *  Holds no game state and nothing interactive: it is `aria-hidden`, `pointer-events: none`,
 *  and rendered as a sibling *behind* the app. That is a deliberate contract, not incidental
 *  — "lean mode" on short viewports removes this layer entirely, and that removal must never
 *  be able to affect playability. Every scene object added later (fireplace, window, cat,
 *  shelf) plugs in here, so the contract is enforced in one place rather than per object.
 *
 *  Landscape phone is already at exactly 100% of its height budget (see the max-height:480px
 *  rules in index.css), so there is genuinely no room for scenery there. Hence lean mode. */
export function SceneLayer() {
  return (
    <div className="scene-layer" aria-hidden="true">
      <div className="scene-hearth-glow" />
      <div className="scene-vignette" />
    </div>
  );
}
