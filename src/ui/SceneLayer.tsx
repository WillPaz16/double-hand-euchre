/** Purely decorative ambient layer sitting behind the game UI.
 *
 *  Holds no game state and nothing interactive: `aria-hidden`, `pointer-events: none`, and
 *  painted behind the app at `z-index: -1`. That is a deliberate contract, not incidental.
 *  "Lean mode" on short viewports removes this layer wholesale, and that removal must never
 *  be able to affect playability — so every scene object lives here and nowhere else.
 *
 *  Two independent gates decide what shows, because they guard different scarce resources:
 *    - height (`max-height: 480px`) — landscape phone is already at 100% of its vertical
 *      budget, so the whole layer goes.
 *    - width  (`min-width: 1120px`) — side scenery needs horizontal margin beside the table
 *      that simply doesn't exist on a phone, so it only appears once there's room for it.
 */
export function SceneLayer() {
  return (
    <div className="scene-layer" aria-hidden="true">
      <div className="scene-fireplace">
        <img className="scene-fireplace-img" src="/art/scene/fireplace.png" alt="" />
        {/* Frame strip animated with transform + steps(): compositor-only. Animating
            background-position instead would repaint every frame — see ASSETS.md. */}
        <div className="scene-fire">
          <img src="/art/scene/fire_sheet.png" alt="" />
        </div>
        <div className="scene-firelight" />
      </div>
      {/* Three stacked layers so snow falls BEHIND the glazing bars — glass, then weather,
          then sash. Baking the bars into the glass would put snow in front of them, which
          reads as dirt on the lens rather than as weather outside. */}
      <div className="scene-window">
        <img className="scene-window-layer" src="/art/scene/window_glass.png" alt="" />
        <div className="scene-snow-clip">
          <div className="scene-snow" />
        </div>
        <img className="scene-window-layer" src="/art/scene/window_frame.png" alt="" />
        <div className="scene-moonlight" />
      </div>
      <div className="scene-hearth-glow" />
      <div className="scene-vignette" />
    </div>
  );
}
