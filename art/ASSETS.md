# Art assets — spec

Generated deterministically by [`generate_art.py`](generate_art.py) — same approach as
`claude-fairy-pixel-art`: a spec here, a script that draws every asset from math and logic (no
AI image generation, no hand-placed pixels to lose track of), reproducible on every run.

Native pixel grid throughout — assets are displayed at a whole-number scale with
`image-rendering: pixelated`, per the "hybrid fixed-grid" approach in the Phase 2 design spec.
Never edit the PNGs in `public/art/` directly; edit this spec / the script and regenerate.

**Native resolution is 100×140** (5:7, the real playing-card ratio). Cards display 1:1 at
native, and every other size is a whole-number fraction of it — the half-size 50×70 is used for
fanned idle-seat backs and for short (landscape-phone) viewports. Never an arbitrary in-between
size, which is what would break pixel crispness.

On narrow screens the hand **fans with overlap** rather than shrinking, the way a real hand of
cards does: each card shows a 52px strip (still above the 44px touch-target minimum), and since
the rank index lives in the card's top-left corner every card in the fan stays readable. This
keeps all six cards of the dealer-discard step on one row at 375px.

## The unit: art pixels (au) and integer scale — READ FIRST

Every asset in this project is authored in **art pixels (au)** and saved at its **true
resolution**. Every place it is displayed renders it at a **whole-number multiple** of that
resolution. There is no second sizing system and there are no exceptions.

- Generator side: `save_asset()` in `generate_art.py` snaps to the `PX` grid, asserts it, then
  halves to true resolution before writing. Every asset goes through it.
- App side: `--px` in `src/styles/index.css`. Any size derived from art is
  `calc(<au> * var(--px) * 1px)` — **never a bare pixel count**.
- Enforcement: `scripts/scale-audit.js` walks the live DOM and fails on any non-integer scale
  or any scene object clipped off the viewport. Run it at every target viewport, not one.

**A smaller card is different ART, not the same art scaled down.** This is why there are three
card backs (`card_back` 50×70, `score_card_back` 30×42, `card_back_seat` 25×35) rather than one
squeezed into three boxes. If you need art at a new size, draw it at that size.

### Why this is stated so forcefully

It was violated for three phases while two separate comments in the codebase asserted it. The
app shipped cards at 1.0×, 0.5× and **0.25×**, the opponent portrait at **0.6×**, scene sprites
at a fixed pixel size that never changed at any viewport, and the felt as a fluid CSS ellipse
with no art at all — six scaling behaviours that disagreed.

Fractional downscales are not merely soft. 0.6× drops pixel rows irregularly and visibly bent
the Old-Timer's moustache and hat brim; 0.25× discarded 80% of the card back's lattice and left
the survivors unevenly spaced. `image-rendering: pixelated` does not rescue a downscale — it
only decides which pixels get thrown away.

The reason it survived so long is worth remembering: **it was only ever checked by eye, per
component, at one viewport.** Each phase was verified against its own goal and shipped green;
none was verified against the whole, so the whole drifted. That is what `scale-audit.js` exists
to prevent, and why it checks globally and numerically rather than locally and visually.

A related consequence: the true resolution had always been *half* the file size, because the
`PX = 2` grid snap meant a 100×140 file held 50×70 distinct blocks. We were storing 50×70 art
in a 100×140 file and calling it "1:1 native". Verified before the change — 26 of 26 card and
portrait assets were byte-identical after halving and restoring, so moving to true resolution
cost nothing at all.

## Palette — cabin by the fire

| Name | Hex | Use |
|---|---|---|
| `parchment` | `#eedeba` | card stock |
| `parchment_shadow` | `#d6c296` | card stock shading |
| `ink` | `#2b1c14` | line work, borders, the silhouette outline |
| `ink_light` | `#5a402e` | secondary line work, the Jack's hose |
| `red` | `#b03a2e` | red-suit ink and garments (warm brick red, not pure red) |
| `gold` | `#d4a54a` | crown, circlet, scepter, hem/collar trim |
| `wood_dark` / `wood_med` / `wood_light` | `#2a1a10` / `#4a2e1e` / `#5b3a29` | card back and table grain |
| `skin` | `#eec296` | face-card skin |
| `blush` | `#df8a76` | cheeks — a small Nintendo-ish warmth cue |
| `beard_gray` | `#c4beb2` | the King's hair, brows and beard |
| `hair_auburn` | `#8c4a26` | the Queen's hair |
| `hair_brown` | `#684428` | the Jack's hair |
| `cap_green` | `#4a764a` | the Jack's cap — deliberately not suit-coloured, so it reads as its own garment against all four suit-coloured tunics |
| `cloth_blue` | `#52607c` | sleeves — a cool contrast so the body isn't one flat slab |
| `steel` / `rose_red` / `leaf_green` | `#acb2bc` / `#c64842` / `#56804c` | the Jack's sword, the Queen's rose |
| `boot_dark` | `#3a2a20` | boots, belt |
| `pip_fill_black` | `#483628` | fill for black-suit pips/garments — distinct from `ink` on purpose, see below |

Every colour also gets a derived shadow tone via `darken()`, applied as a bottom-right band on
each shape (light from the top-left). One derived tone per material keeps the palette from
exploding while still giving everything the 2-tone look that reads as pixel art rather than
flat vector.

**Trap worth documenting:** the outline colour is `ink` (near-black). A black-suit pip or
garment filled with `ink` too is invisible against its own outline — this shipped broken once.
Anything outlined uses `body_color(suit)` (→ `pip_fill_black` for clubs/spades, `red` for
hearts/diamonds), never `ink` directly. The un-outlined corner rank glyph is the one place
`text_color(suit)` (true `ink`/`red`) is correct, since flat text on parchment doesn't need the
distinction.

## Cards

- **24 faces** — 4 suits × {9, 10, J, Q, K, A}.
- **Corners:** rank glyph (5×7 bitmap font at 2x block scale) stacked over a small outlined suit
  pip, with a deliberate gap between them, top-left and mirrored 180° bottom-right.
- **Suit pips:** real geometry, not hand-typed bitmaps or crude circle-unions. Hearts and spades
  use the actual parametric heart curve
  (`x = 16sin³t, y = 13cos t − 5cos 2t − 2cos 3t − cos 4t`); the spade is that same curve
  flipped plus a stem — the real heart/spade relationship. Clubs are three lobes at a wide
  enough arrangement radius to keep a visible waist between them, with a narrow stem that flares
  only at the foot (a thick trunk made it read as a tree). The diamond is slightly narrower than
  tall, since a 1:1 rhombus reads squat beside the other three. A mini corner pip and a large
  centre pip are the same mask function at different sizes, so curves stay round at any scale.
  - **Bug worth remembering:** an early heart/spade flip had the orientation boolean inverted —
    the two looked similar enough at a glance that it took a test render with explicit
    top/bottom markers to prove which was upside down. When a shape's correctness depends on
    orientation, verify against an unambiguous reference; don't eyeball two similar blobs.
- **Number cards (9, 10, A):** one large outlined centre pip. A single bold pip rather than a
  traditional multi-pip grid — at this card size the grid gets cramped, and the pixel card decks
  used as reference do the same.
- **Face cards (J, Q, K):** **full-body avatars**, not busts — modelled on Gen 4/5 Pokémon
  overworld trainer sprites. A big round head carries most of the characterisation (~40% of
  figure height), headwear is the primary silhouette signature, the body is small and simple,
  and there is **one dark outline around the whole figure**, with internal detail carried by
  colour changes and the shadow tone — *not* a heavy outline around each piece. That
  single-silhouette rule is the main thing separating a Pokémon-sprite look from a sticker
  collage, and it's why `composite_sprite()` unions all parts before outlining.
  - **King** — grizzled, gray beard, furrowed brows, 5-peak gold crown, holds a **scepter**. A
    deliberate nod to the single-player opponent rather than a generic storybook king.
  - **Queen** — long auburn hair, gold circlet with a gem, level brows, smiling, holds a **rose**.
  - **Jack** — a knave, not royalty: no crown, tilted cap with a plume, short tunic with visible
    legs and boots, holds a **sword**, and **winks**.
  - Each rank carries a distinct prop and expression. That, more than headwear alone, is what
    makes the three read as different *people* rather than one body wearing three hats.
  - Sleeves are `cloth_blue` against the suit-coloured garment so the body isn't a flat slab;
    the garment stays suit-coloured so red/black still reads at a glance.
- **Card back:** same 100×140 frame, `wood_dark` base with a `wood_med`/`wood_light` diamond
  lattice and a `gold` inner border.

## Layout budget — asserted, not eyeballed

The two corner index blocks sit in fixed reserved rectangles. The forbidden region is
**L-shaped, not a vertical band**: between roughly y=41 and y=99 the card is free almost edge to
edge, which is where arms and held props live. Treating it as one narrow column is what made
earlier drafts look cramped.

Artwork intruding into an index box was a repeat bug across several drafts — including cases
that survived visual review, because the 2px silhouette outline pushes every shape 2px further
out than its nominal coordinates. `_assert_art_clear_of_indices()` now raises at generation time
if any character pixel lands in a reserved box, so the budget is enforced by the generator
rather than re-checked by eye on every redesign.

## Environment shading — `ramp()` (Phase 2d)

`darken()` (one derived shadow tone) is still what every **card** sprite uses, and is
deliberately frozen — the 24 card faces are approved and their PNGs are asserted byte-identical
on every run. Environment art instead uses `ramp(color, warm=True)`, which returns four tones
(highlight, base, shadow, deep) with a **temperature split**: under warm light highlights bend
amber and shadows bend blue; `warm=False` flips it for anything lit by the window.

That split is the highest-impact idea of the phase. A plain multiply keeps every tone on one
hue line, which is what made a three-brown environment read muddy — with nothing cool in frame,
warm firelight has nothing to be warm *against*.

**Bug worth remembering:** the first version multiplied by a factor and then added a flat tint.
That works on mid-dark colours, which is exactly why it shipped — it was only ever eyeballed on
a brown. On bright or saturated colours, clamping silently discarded the tint on any channel
near 255 and *inverted* the intended hue shift: `FIRE_CORE` highlighted to `(255,255,166)` (red
and green both pinned, so it read greener, not warmer) and `FROST` to `(234,254,255)` (bending
cool when the docstring promised warm). `_shift()` now scales both the lightening and the tint
by each channel's remaining **headroom**, so neither can clamp at any brightness. Validate
colour maths against the extremes of the palette, not one convenient mid-tone.

**Honest limit of that fix.** Headroom scaling stops the clamping, but it does not preserve
the temperature *relative to base* on colours already at a channel ceiling. `FIRE_CORE` is
already 255 red, so lightening can only raise green and blue — its highlight is necessarily
*less* saturated, and therefore less warm, than its base. That is physically right (a
highlight approaching white loses hue) but it does mean the warm/cool split is weakest exactly
at the brightest, most saturated colours. Where a warm highlight genuinely matters on a bright
element, tint the base colour instead of relying on the ramp.

## Environment palette

`TABLE_WOOD`, `WALL_WOOD`, `CHINKING`, `FLOOR_WOOD`, `NIGHT_BLUE`/`NIGHT_BLUE_DEEP`, `FROST`,
`FIRE_CORE`/`FIRE_MID`/`FIRE_DEEP`, `EMBER`, `STONE_LIGHT`/`MED`/`DARK`, `RUG_RED`/`RUG_CREAM`.

These are separate constants on purpose: `WOOD_DARK`/`MED`/`LIGHT` are **not** reused or
modified, because `make_card_back()` depends on them and the card art is frozen.

## Tiles vs. placed objects — different rules

- **`table_felt.png`** (128×128) — horizontal planks with a gentle crown, grain running *along*
  them. The calmest surface in the room by design: it sits directly under the cards.
- **`wall_texture.png`** (128×128) — three stacked logs of unequal height, each shaded as a
  cylinder, separated by a dark recess. Compressed toward base via `_mix()` so the backdrop
  recedes rather than competing with the cards.
- **`scene/floor.png`** (160×160) — long boards, one low-contrast end-joint each, quiet grain.

Value order is deliberate and asserted by eye at full size — wall (L≈33) → floor (L≈54) →
table (L≈62), so the room reads back-to-front.

### Rules for repeating tiles

1. **Judge a tile only at the size it is displayed.** This is the meta-rule and every failure
   below was hidden by ignoring it. Reviewing a 96×96 PNG on its own cannot show a tiling
   defect, because the defect *is* the repetition. Tile it out to viewport width and look at
   that instead — `PIL` can do it in six lines.
2. **No point features.** Knots produced an unmistakable polka-dot grid at 3–4 repeats.
   Distinctive one-off marks belong in the scene layer as placed decals.
3. **Model the material, don't decorate the tile.** Three passes at the wall, and the first two
   both failed by adding marks:
   - *v1* claimed vertical→horizontal logs would self-break the striping. Wrong; nothing
     interrupts a horizontal run either.
   - *v2* added butt joints and segmented the mortar so no line ran the full width. Tiled to
     1440px it read as **brickwork** — segmented mortar plus vertical joints is precisely a
     brick bond. It cured the striping by changing the material.
   - *v3* asked what the thing *is*. A log wall **is** horizontal bands; bands were never the
     defect. It read as venetian blinds because the bands were flat fills separated by thin
     bright rules, so the eye locked onto the rules — which are the tile's period. Giving each
     log a smooth cylindrical falloff makes the band a lit surface with volume and the chinking
     a shadowed recess. What kills a tiling signature is the **absence of hard uniform edges**,
     not the addition of more marks.
4. **A tile under the play area has a second job: get out of the way.** The old table surface
   was the loudest texture on screen — dense bright grain across the whole play area — in
   direct contradiction of the design spec's "rich periphery, calm centre". Grain there is now
   pulled almost to base; the planks carry the form.

Placed scene objects (below) are exempt from 2 and 3 — they never repeat, so per-stone
variation and individual detail are exactly what they *should* have.

### Lighting — `light_from()` (Phase 2d.5)

The room's light source is the hearth, in the left margin. Scene sprites get a directional
relight as a post-process: hearth-facing side lifted warm, far side dropped cool, along a
smooth horizontal ramp.

Applied in `main()` rather than inside each generator, for two reasons: the light model is
then stated once in one place, and it demonstrably cannot reach the frozen card art. The
fireplace and the window are their own light sources and are excluded.

**How the need was found, and why it was invisible by eye.** Comparing each sprite's left-half
mean luminance against its right half gave deltas under 1 unit for *every* scene object. They
were all shaded purely top-down, so nothing in the room had a light direction — and a room
whose objects don't agree where the light comes from reads as stickers on a backdrop however
good the gradient painted over them is. After the pass the same measurement gives +22 to +25.
Measuring beat looking here: "flat" is not a thing the eye reliably names.

Keep `strength` at or below ~0.2. Higher and pixel art starts to look airbrushed.

## Scene objects (Phase 2d.2)

All live in `<SceneLayer>` (`src/ui/SceneLayer.tsx`) — `aria-hidden`, `pointer-events: none`,
`z-index: -1`.

**`z-index: -1` is load-bearing, not cosmetic.** A positioned element paints *above* static
siblings, so at `z-index: 0` the hearth glow tinted the cards orange — directly attacking the
card readability this phase names as its top risk. Behind the content it lights the room; in
front it lights the cards.

- **`fireplace.png`** (140×186) — stone surround, firebox, timber mantel. Stone uses a
  *compressed* ramp: `ramp()`'s temperature swing is right for wood but turns stone into a
  patchwork of blue-grey and khaki, and masonry needs visible mortar joints (draw a mortar
  ground, inset each stone) or it reads as a colour-blocked grid.
- **`fire_sheet.png`** (4 frames × 66×58) — flame tongues whose width profile is `1 - t**1.6`,
  broad through the lower half; a simple taper from the base reads as a cone. Frame variation
  comes only from phase/sway so the shape family stays consistent — animating by swapping
  unrelated blobs reads as noise, not fire.
  - **Bug worth remembering:** height and sway were both driven by `sin(phase)`. With four
    frames, phases 0 and π both give `sin = 0`, so frames 0 and 2 came out identical in the
    dominant outer silhouette — four frames, three distinct shapes, and a loop that pumped
    between two states. Height now uses `sin` and sway `cos` so the pair traces a circle and
    every sample differs. Sampling one sinusoid at multiples of π is the general trap.
  - The hearth's own stones are lit by firelight falloff from the opening. An object that
    throws light into the room but is itself uniformly lit quietly breaks the illusion.
- **`window_glass.png` + `window_frame.png`** (120×146) — split into two layers so snow falls
  *behind* the glazing bars; baking the bars into the glass puts snow in front of them, which
  reads as dirt on the lens. The glass is the room's **cool reference**, built with
  `warm=False`; the sash is firelit and warm. That juxtaposition is the point of the object.
- **`snow.png`** (120×72) — vertically seamless, animated by continuous `translateY` rather
  than stepped frames. Snow stepped at 4–8fps stutters; the fire *wants* stepping, snow does
  not. Rate matters: 3.5s per 72px tile ≈ 21px/s, crossing the pane in ~7s. An earlier 11s
  worked out at 6.5px/s — about 22s to cross — and read as static specks, not weather.
- **`floor.png`** (96×96) — tileable floorboards with staggered end-joints, plus a CSS
  skirting line at the wall/floor junction. The room previously had a wall and a table but no
  ground, which was the clearest single reason it read as props pinned to a backdrop. Value
  sits between wall and table, so the scene reads back-to-front: wall (darkest) → floor →
  table (lightest). Scene objects are anchored to this floor line, not floated on the wall.

## Living things (Phase 2d.3)

- **`seated_old_timer.png`** (140×196) — the opponent, seated in a chair, holding a fan of
  card backs. Head geometry (radius, hat construction, mustache) is copied exactly from
  `_old_timer_parts()` so the seated figure and the scoreboard portrait read as *one person*
  rather than two similar characters; only the framing differs.
  - **Bug worth remembering — a variable named for the intent, in code that did something
    else.** The fan loop's variable was called `ang`, but no rotation was ever applied; it was
    used purely as an x-offset. Five 18px cards at 12px spacing merged into one contiguous
    band, filled brown with a gold inner rect — unmistakably a belt with a brass buckle. This
    is close to invisible on re-reading, because the author sees the name and reads the
    intent while a fresh reader sees the belt. Each card is now genuinely rotated on its own
    layer (NEAREST, to keep edges hard) before compositing.
  - Two more from the same review: the chair was `darken(WOOD_MED, 0.55)`, near-black against
    a dark wall and therefore invisible, and the torso ran off the canvas with no thigh
    break — so he read as a standing bust, not a seated man. The chair now uses lit ramp
    tones and the torso stops at a drawn lap. Arms were FLANNEL_RED over a FLANNEL_RED torso
    in an overlapping x-range, i.e. no silhouette separation at all; they now use a shade
    tone.
  - A suggestion that was **evaluated and rejected on measurement**: shifting him left so the
    table's rim occludes his lower edge. Measured at 1400×860, a 40px shift puts only 20px of
    his 140px width behind the table, leaving 120px of the bottom edge still visible — it
    does not do what it intends. Drawing a real lap fixes the underlying problem instead.
  - **Placement is a compromise worth documenting.** The design intent was "seated across the
    table". The table spans the full width of its container with the scoreboard and status
    banner filling the entire band above it, so there is no across-the-table space to put a
    figure without restructuring the UI — which would put the carefully-guarded
    landscape/portrait height budgets at risk. He sits in the side margin instead, on the
    floor, at the side of the table. Still a person in the room; just not opposite you.
    Revisit if the layout is ever reworked.
- **`cat_sheet.png`** (2 frames × 52×30) — curled asleep by the hearth. Two frames is enough
  because the motion is a swell, not a gait: the body rises one pixel. At 3.4s that reads as
  breathing; more frames would add nothing perceptible at this size.
- **`shelf.png`** (118×62) — books, jars, a lit lantern. A placed one-off, so it carries all
  the distinctive point detail a repeating tile must not.

Both the cat and the seated figure rest on the floor plane added in the 2d.2 follow-up.
Without that ground they would float exactly the way the fireplace originally did — which is
why the floor had to land before this sub-phase.

## Animation convention

Sprite sheets are horizontal strips (`make_sprite_sheet`). CSS shows one frame through an
`overflow: hidden` window and animates the strip with **`transform` + `steps(n)`** —
**never `background-position`**, which repaints every frame where `transform` stays on the
compositor. With several ambient loops running continuously, that is the whole battery story.

Every ambient animation needs a `prefers-reduced-motion` guard.

**Two independent gates**, guarding two different scarce resources:
- `max-height: 480px` (**lean mode**) — landscape phone is already at 100% of its vertical
  budget, so the entire scene layer is dropped. Verified: 0 running animations in that mode.
- `min-width: 1240px` — side scenery needs real horizontal margin beside the table. 1240 =
  the table's 900px cap plus 170px each side. An earlier 1120 gate was wrong in a specific
  way worth remembering: it turned scenery *on* at a width where the objects then slid under
  the table, and since the layer is `z-index: -1` they were silently occluded by it. A
  `max(24px, …)` floor on their position gave back exactly the margin the gate had promised.

Scenery is decorative-only precisely so these gates can remove it without touching playability.

## Output

All PNGs write to `public/art/` (Vite serves `public/` at the site root unchanged):

```
public/art/cards/{suit}_{rank}.png         × 24
public/art/card_back.png
public/art/table_felt.png
public/art/wall_texture.png
public/art/portraits/old_timer_{state}.png × 3
public/art/scoreboard/{suit}_{rank}.png    × 4   (hearts + spades only; see SCORE_SUIT)
public/art/scene/fireplace.png
public/art/scene/fire_sheet.png            4 frames
public/art/scene/window_glass.png
public/art/scene/window_frame.png
public/art/scene/snow.png
public/art/scene/floor.png
public/art/scene/seated_old_timer.png
public/art/scene/cat_sheet.png             2 frames
public/art/scene/shelf.png
```

## Audio (Phase 2c)

Generated by [`generate_audio.py`](generate_audio.py) — same philosophy as the art script:
plain waveform math via the stdlib `wave`/`struct` modules, no samples, no AI generation,
byte-identical on every run (pseudo-noise comes from a seeded LCG, never `random`). SFX and
stingers only, deliberately no music, per the Phase 2 design spec.

```
public/audio/card_play.wav        short filtered-noise snap — a card landing
public/audio/trick_win.wav        two-note triangle-wave chime — a trick taken
public/audio/euchre_fanfare.wav   four-note square-wave arpeggio — the maker's side euchred
public/audio/game_win_fanfare.wav longer arpeggio + held chord — the game is won
public/audio/shuffle.wav          six staggered noise bursts — the riffle at a new deal
```

Wired up in `src/game/useSfx.ts`, which watches the same redacted `view` the rest of the UI
renders from — no dedicated event bus, just diffing `currentTrick.length` / `tricksWon` /
`phase` between renders, the same pattern `useOpponentExpression` uses for the portrait.

```bash
python3 art/generate_audio.py
```

## Regenerating

```bash
python3 art/generate_art.py
python3 art/generate_audio.py
```

Both are deterministic — no randomness, so re-running with no spec changes produces
byte-identical output.
