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

- **`table_felt.png`** (64×64) — horizontal planks, grain running *along* them, seams lit from
  above.
- **`wall_texture.png`** (96×96) — horizontally stacked logs with mortar chinking, courses
  broken by butt joints at varying offsets, ramp compressed toward base via `_mix()` so the
  backdrop recedes rather than competing with the cards.

Two rules learned the hard way, both about *repeating* tiles specifically:

1. **No point features.** Knots in both tiles produced an unmistakable polka-dot grid at 3–4
   repeats. Distinctive one-off marks belong in the scene layer as placed decals.
2. **No unbroken uniform runs.** An earlier draft claimed switching vertical logs to horizontal
   would fix striping because horizontal stacking is "self-breaking". **That was wrong** — review
   caught it; nothing interrupts a horizontal run either. Axis was never the cause. Unbroken
   runs at uniform spacing were, and the brightest element (chinking) telegraphed the tile
   hardest, reading as venetian blinds. Butt joints + per-course variation + lower chinking
   contrast are what actually fixed it.

Placed scene objects (below) are exempt from both rules — they never repeat, so per-stone
variation and individual detail are exactly what they *should* have.

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
