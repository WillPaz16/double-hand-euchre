# Art assets — spec

Generated deterministically by [`generate_art.py`](generate_art.py) — same approach as
`claude-fairy-pixel-art`: a spec here, a script that draws every asset from math and logic (no
AI image generation, no hand-placed pixels to lose track of), reproducible on every run.

Native pixel grid throughout — assets are displayed at a whole-number scale with
`image-rendering: pixelated`, per the "hybrid fixed-grid" approach in the Phase 2 design spec.
Never edit the PNGs in `public/art/` directly; edit this spec / the script and regenerate.

**A card is 50×70 au** (5:7, the real playing-card ratio) and displays at `--px` 1 or 2, i.e.
50×70 or 100×140 screen pixels. Never an arbitrary in-between size, which is what would break
pixel crispness. (This line used to read "native resolution is 100×140, cards display 1:1",
which contradicted the READ FIRST section immediately below it and was left standing for three
phases after 2f.1 halved every file to its true resolution. The 100×140 figure is the
generator's *canvas*, not the file.)

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
- Enforcement: `scripts/scale-audit.js` walks the live DOM and fails on any non-integer scale,
  any scene object clipped off the viewport, or (2h.1) any scene object more than 35% hidden
  behind gameplay chrome (the scoreboard, status banner, hand tray, opponent). Run via
  `npm run audit` (Playwright, headless, all four target viewports, see `scripts/audit.ts`) —
  wired into CI (2h.2) so "run it at every target viewport, not one" is no longer something
  that depends on a person remembering to. That dependency is exactly how 2g.4 shipped a
  regression this check would have caught: verified once, at one viewport, with a snippet
  that lived nowhere.

**A smaller card is different ART, not the same art scaled down.** This is why there are three
card backs (`card_back` 50×70, `score_card_back` 30×42, `card_back_seat` 25×35) rather than one
squeezed into three boxes. If you need art at a new size, draw it at that size.

### The chunk: how coarse a grid each class wears (Phase 2g.2)

`save_asset(..., chunk=n)` snaps to a `PX * n` grid before halving. Two classes:

| Class | chunk | Screen px per art feature at `--px` 2 |
|---|---|---|
| Cards, scoreboard, suit icons, portraits | **1** | 2 |
| Everything in the room, and the opponent | **2** | **4** |

4 is the apparent pixel size the Stardew/Pokémon references actually use; the game shipped at
2, which is the literal measurement behind "it doesn't look pixelated". Cards stay fine because
a rank index and a suit pip must survive at the 25×35 au seat size, and there is no room there
to spend half the resolution. Same principle as "a smaller card is different art" — how coarse
a grid a thing can wear depends on what it has to say.

**Quantise the shading BEFORE coarsening the grid. Never the reverse.** Test-coarsening the
pre-2g.1 opponent moved him only 361 → 245 colours, because each larger block still carried its
own unique tint — the result is big blocks of subtly-different colour, i.e. visible banding,
which is worse than what you started with. Band the light first (see `light_from`), then chunk.

**Draw features as grid-aligned rectangles, not curves you hope survive.** A 16×20 ellipse eye
quantises to a 4×5 block and renders as a diamond. At these sizes a pixel-art eye *is* a
rectangle.

### Assertions, because "checked by eye" is not a check

Three build-time guards, each written after the thing it guards had already shipped broken:

- `_assert_pixel_grid` — no detail finer than the grid.
- `_assert_value_ladder` — wall < floor < table, minimum 6 lightness points apart. ASSETS.md
  specified this ordering from Phase 2d **with the numbers L 33/54/62 and the words "asserted
  by eye at full size"**. Measured, the shipped tiles were 13.7/19.8/23.7 — a third of the
  stated separation, wrong for four phases, in the three largest surfaces in the game.
- `_assert_sprite_colours` — ceiling of 64 distinct colours per sprite. The shipped opponent
  carried **361**, roughly fifty skin tones within four RGB units of each other, because
  `light_from` tinted every column independently. Stardew-class character sprites carry 12–25.

All three are proven to bite: breaking the ladder or un-banding the light fails the build with
a specific message. An invariant only ever checked by eye is not an invariant — that is exactly
how each of these drifted while every phase shipped green.

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

## Regenerating: use Python 3.11

`generate_art.py` needs Pillow, which on this machine is installed for **3.11 only**. Bare
`python3` may resolve to a different interpreter depending on PATH order and will fail with
`ModuleNotFoundError: No module named 'PIL'`. If that happens it is not a code problem:

```
/Library/Frameworks/Python.framework/Versions/3.11/bin/python3 art/generate_art.py
```

**And check determinism on PIXELS, not file bytes.** The generator is deterministic in what it
draws, but Pillow versions encode PNGs differently — regenerating identical images under a
different Pillow rewrote every card 40 bytes smaller with a `getbbox()` diff of `None`. So a
`md5` sweep over the files reports a false failure the moment the interpreter changes:

```python
Image.open(p).convert('RGBA').tobytes()   # compare this
```

Worth being precise about, because "re-running produces identical output" is one of this
project's standing guarantees, and a guarantee that silently depends on which interpreter
happens to be first on PATH is not one.

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

### Environment palette (separate from the card palette on purpose)

`wood_dark/med/light` above are **not** reused here: `make_card_back()` depends on them and the
card art is frozen. The environment gets its own bases, each fed through `ramp()` at use site.

| Name | Hex | Use |
|---|---|---|
| `table_wood` | `#b1744e` | the felt/table surface — **L 50** |
| `floor_wood` | `#946442` | floorboards — **L 42** |
| `wall_wood` | `#573e32` | log wall — **L 27** |
| `night_blue_deep` | `#212d52` | window glass, the room's cool reference |
| `frost` | `#b0c6dc` | window frost blooms |
| `fire_core` / `fire_mid` / `fire_deep` / `ember` | `#ffe28c` / `#f09634` / `#bc4a1e` / `#782816` | flame tongues, log embers |
| `stone_med` / `stone_dark` | `#635548` / `#40362e` | hearth masonry — warm greys, never neutral ones |
| `rug_red` / `rug_cream` | `#80342e` / `#c6ac84` | the rug, and the shelf's books |
| `flannel_red` / `hat_fur` | `#8c2e28` / `#ded2be` | the Old-Timer |
| `picture_sky` | `#6c9cbe` | the framed landscape — **H 201** |
| `coat_green` | `#44604e` | the hung coat — **H 147** |

**The three L values are the value ladder** and are asserted at build time, not eyeballed —
see the assertions section above. They are deliberately NOT the L 33/54/62 this document used
to specify: mocked up under the real CSS vignette and hearth wash, those land on a *daylit*
room, and at L 62 the table goes pale and milky and stops reading as wood. Mood comes from the
lighting layer over properly-lit materials, not from painting the materials black and leaving
the low-alpha glows nothing to lift.

**`picture_sky` and `coat_green` exist as much for their HUE as their object.** Audited, 33 of
41 constants sat inside a single 42° warm arc (2.7–44.9°), with nothing at all between 45° and
108° and no purple or magenta anywhere. That is the palette-level reason the room read monotone
however the values were tuned. A painting of somewhere else and a piece of cloth are the two
objects that can carry cool mid-hues without contradicting a firelit night cabin.

### Shading: `ramp()` for materials, `darken()` for card art

Card art keeps its single derived shadow tone via `darken()`, applied as a bottom-right band on
each shape (light from the top-left) — a 2-tone look that reads as pixel art rather than flat
vector, and frozen along with the cards themselves.

Environment materials use `ramp(colour, warm=True)` → `(highlight, base, shadow, deep)`, which
works in **HLS**, not RGB. It was rebuilt there in 2g.1 because the RGB version measurably did
not do what its docstring claimed: it blew out highlights (+16 to +25 lightness points, so
every call site mixed them halfway back), rotated shadows by **under 1.5°** rather than bending
them cool, and returned an S 3.9% grey on cool bases. In HLS, lightness/hue/saturation stop
fighting over three channels and each step states what it wants. Now a consistent 28-point
spread and 27–30° of real rotation, **validated against palette extremes** (`fire_core`,
`parchment`, `frost`), not one convenient mid-brown — that shortcut is how the original bug
shipped.

**Calm is not the same as flat.** The felt and floor compressed their ramps a second time on
top of that, leaving the felt at 15 colours across 3.4 lightness points and 1.1° of hue: one
brown with dither noise. Those factors were tuned against the old violent highlight and
double-compensated once it was fixed. Keep grain quiet; keep form.

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

- **`table_felt.png`** (64×64) — horizontal planks with a gentle crown, grain running *along*
  them. The calmest surface in the room by design: it sits directly under the cards.
- **`wall_texture.png`** (64×64) — three stacked logs of unequal height, each shaded as a
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

- **`fireplace.png`** (154×206) — stone surround, firebox, timber mantel. Stone uses a
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
- **`window_glass.png` + `window_frame.png`** (132×162) — split into two layers so snow falls
  *behind* the glazing bars; baking the bars into the glass puts snow in front of them, which
  reads as dirt on the lens. The glass is the room's **cool reference**, built with
  `warm=False`; the sash is firelit and warm. That juxtaposition is the point of the object.
- **`snow.png`** (120×72) — vertically seamless, animated by continuous `translateY` rather
  than stepped frames. Snow stepped at 4–8fps stutters; the fire *wants* stepping, snow does
  not. Rate matters: 3.5s per 72px tile ≈ 21px/s, crossing the pane in ~7s. An earlier 11s
  worked out at 6.5px/s — about 22s to cross — and read as static specks, not weather.
- **`floor.png`** (80×80) — tileable floorboards with staggered end-joints, plus a CSS
  skirting line at the wall/floor junction. The room previously had a wall and a table but no
  ground, which was the clearest single reason it read as props pinned to a backdrop. Value
  sits between wall and table, so the scene reads back-to-front: wall (darkest) → floor →
  table (lightest). Scene objects are anchored to this floor line, not floated on the wall.

## Living things (Phase 2d.3)

- **`opponent_{idle,happy,rueful,blink}.png`** (150×140 au) — the Old-Timer, head-and-shoulders,
  seated behind the table's north edge where his two card fans are. Rendered by `Table.tsx`, not
  by `SceneLayer` — he is the person you are playing, not room decor.
  - **This replaced a `seated_old_timer.png` that no longer exists.** That asset was a full
    seated figure in the SIDE MARGIN, 538px right of and 226px below his own card fans — an
    artifact of 2e.4's seating change never being reconciled with the scenery. 2f.3 moved him
    across the table; its generator became dead code and was deleted in 2g.5. This section
    described it, in detail, for two phases after it stopped being generated.
  - Head is 62×66 au against a 50×70 au card — a deliberate STYLISED ratio ("head ≈ one card
    height"), not physical scale, which would put it at ~181 au. The hearth and window follow
    the same convention; see the 2.2× note under Scene.
  - Features are drawn as **grid-aligned rectangles, not ellipses**. At `chunk=2` a 16×20
    ellipse eye quantises to a 4×5 block and renders as a diamond. A pixel-art eye at this size
    *is* a rectangle — draw it that way rather than hoping a curve survives the grid.
  - Face carries real modelling: brow ridge, lit nose ridge with its own shadow, cheekbone and
    jaw shading, eye-socket shadow, crow's feet. Before 2g.5 the head was one flat `SKIN`
    ellipse with no features but eyes, brows and a moustache.
  - `blink` is a fourth FILE, swapped by a timer in `useOpponentExpression`, not a sprite-sheet
    frame. `steps()` gives every frame an equal slice, so a 140ms blink every few seconds would
    need ~40 near-identical frames to express as a duty cycle. It fires only while idle —
    `happy` and `rueful` redraw the eyes themselves.
- **`cat_sheet.png`** (2 frames × 44×28) — curled asleep by the hearth. Two frames is enough
  because the motion is a swell, not a gait: the body rises one pixel. At 3.4s that reads as
  breathing; more frames would add nothing perceptible at this size.
- **`shelf.png`** (60×32 au) — books, jars, a lit lantern. A placed one-off, so it carries all
  the distinctive point detail a repeating tile must not.

The cat rests on the floor plane added in the 2d.2 follow-up. Without that ground it would
float exactly the way the fireplace originally did — which is why the floor had to land before
this sub-phase.

### Wall and floor furniture (Phase 2g.4)

`picture.png` (48×36 au), `antlers.png` (60×40), `clock.png` (40×40), `coat_hooks.png` (42×54),
`woodpile.png` (52×32). Placed one-offs, so **exempt from the tile rules below** — "no point
features" exists to stop a repeating tile betraying its grid, and none of these repeat.

Built because the span between the hearth and the window — 53% of the viewport's width —
carried nothing but the opponent's head. Two things worth keeping:

- **Hang them from the TOP edge, not up from the floor line.** The free wall is defined by what
  the table and the opponent occupy, and both grow downward. Measuring up from the floor put
  the clock behind the opponent's card fan and the antlers poking out of his hands.
- **The picture is a DAYLIT scene on purpose.** The only window shows night, so a sunlit
  painting is the one place the palette can carry a mid-blue and a green without contradicting
  a firelit night cabin. Same logic for the coat's green. See the hue-range note under Palette.

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

61 PNGs. Anything not on this list is not generated — the list is the inventory, so add to it
in the same commit that adds the asset. (It previously omitted twelve shipped files and named
one that had stopped existing, which is how `seated_old_timer.png` kept a four-paragraph spec
section two phases after its generator went dead.)

```
public/art/cards/{suit}_{rank}.png         × 24   chunk=1
public/art/card_back.png                          chunk=1
public/art/card_back_seat.png                     chunk=1   25×35 au
public/art/score_card_back.png                    chunk=1   30×42 au
public/art/scoreboard/{suit}_{rank}.png    × 4    chunk=1   (hearts + spades; see SCORE_SUIT)
public/art/suits/{suit}.png                × 4    chunk=1   24×24 au, for the upcard wheel
public/art/icon-{32,192,512}.png           × 3    PWA/OS sizes, NOT via save_asset
public/art/portraits/old_timer_{state}.png × 3    chunk=1
public/art/opponent_{idle,happy,rueful,blink}.png × 4   chunk=2
public/art/table_felt.png                         chunk=2
public/art/wall_texture.png                       chunk=2
public/art/scene/fireplace.png                    chunk=2
public/art/scene/fire_sheet.png            4 frames         chunk=2
public/art/scene/window_glass.png                 chunk=2
public/art/scene/window_frame.png                 chunk=2
public/art/scene/snow.png                         chunk=2
public/art/scene/floor.png                        chunk=2
public/art/scene/rug.png                          chunk=2
public/art/scene/cat_sheet.png             2 frames         chunk=2
public/art/scene/shelf.png                        chunk=2
public/art/scene/{picture,antlers,clock,coat_hooks,woodpile}.png × 5   chunk=2
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
