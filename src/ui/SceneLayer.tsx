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
 *    - width  (`min-width: 1240px`) — side scenery needs real horizontal margin beside the
 *      table. 1240 = the table's 900px cap plus 170px each side; gating at 1120 let the
 *      fireplace and window slide *under* the table, and since this layer is z-index -1 they
 *      were simply occluded by it.
 *
 *  Every asset is a CSS background on a gated selector rather than an <img>, so nothing is
 *  fetched at viewports where it can never be shown.
 */
export function SceneLayer() {
  return (
    <div className="scene-layer" aria-hidden="true">
      {/* The floor. Without a ground plane and a wall/floor junction the room read as props
          pinned to a backdrop; it is also what 2d.3's seated figure and cat will rest on. */}
      <div className="scene-floor" />

      <div className="scene-fireplace">
        {/* Sprite strip animated with transform + steps(): compositor-only. Animating
            background-position instead would repaint every frame — see ASSETS.md. */}
        <div className="scene-fire">
          <div className="scene-fire-strip" />
        </div>
        <div className="scene-firelight" />
      </div>
      {/* Three stacked layers so snow falls BEHIND the glazing bars — glass, then weather,
          then sash. Baking the bars into the glass would put snow in front of them, which
          reads as dirt on the lens rather than as weather outside. */}
      <div className="scene-window">
        <div className="scene-window-glass" />
        <div className="scene-snow-clip">
          <div className="scene-snow" />
        </div>
        <div className="scene-window-frame" />
        <div className="scene-moonlight" />
      </div>
      {/* Living things. The cat rests on the floor plane added in the 2d.2 follow-up —
          without that ground it would float exactly the way the fireplace originally did.
          The Old-Timer used to be here too, parked in the right margin, while his two card
          fans sat at the top of the table — 538px and 226px away from his own hands. He now
          lives in Table.tsx, across the table where his hands are (2f.3). */}
      <div className="scene-shelf" />
      <div className="scene-cat">
        <div className="scene-cat-strip" />
      </div>

      <div className="scene-hearth-glow" />
      <div className="scene-vignette" />
    </div>
  );
}
