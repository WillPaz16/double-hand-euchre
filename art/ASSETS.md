# Art assets — spec

Generated deterministically by [`generate_art.py`](generate_art.py) — same approach as
`claude-fairy-pixel-art`: a spec here, a script that draws every asset from math and logic (no
AI image generation, no hand-placed pixels to lose track of), reproducible on every run.

Native pixel grid throughout — assets are drawn small and displayed at a whole-number scale
with `image-rendering: pixelated`, per the "hybrid fixed-grid" approach in the Phase 2 design
spec. Never edit the PNGs in `public/art/` directly; edit this spec / the script and
regenerate.

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
| `ink` | `#2b1c14` | line work, black-suit ink, borders |
| `ink_light` | `#5a402e` | secondary line work |
| `red` | `#b03a2e` | red-suit ink (warm brick red, not pure red) |
| `gold` | `#d4a54a` | accents — crown, circlet, highlight card border |
| `wood_dark` | `#2a1a10` | card back base, table shadow |
| `wood_med` | `#4a2e1e` | card back pattern, table mid |
| `wood_light` | `#5b3a29` | card back pattern highlight, table grain |
| `skin` | `#e7b78a` | face-card portrait skin tone |
| `blush` | `#dc8470` | cheeks — a small Nintendo-ish warmth cue |
| `beard_gray` | `#b0a89c` | the King's beard/brows |
| `hair_auburn` | `#804424` | the Queen's hair |
| `cap_navy` | `#343c54` | the Jack's cap — deliberately not suit-colored, so it reads as its
  own garment against all four suit-colored collars |
| `pip_fill_black` | `#483628` | fill for black-suit pips/robes — see "outline system" below;
  distinct from `ink` on purpose |

This matches the existing placeholder CSS palette from Phase 2a, so the swap-in is a visual
upgrade, not a palette change.

## Outline system — the "sticker" look

Styled after Balatro's card art (bold outlines, saturated flat fills) crossed with a
Pokémon/Nintendo sense of whimsy (chibi proportions, expressive faces), rather than either
alone. The mechanism, `outlined_sprite()` in the script: render a shape as a filled mask,
dilate it by the outline width, take the ring between dilated and original as the outline, then
paint outline-then-fill. Every distinct piece — a head, a crown, a pip, a robe — is its own
outlined sprite composited in place; that layered, separately-outlined look (rather than one
outline around the whole card) is what actually reads as "sticker."

**Trap worth documenting:** the outline color is `ink` (near-black). A black-suit pip or robe
filled with `ink` too is invisible against its own outline — this shipped broken once already.
Anything that gets outlined uses `body_color(suit)` (→ `pip_fill_black` for clubs/spades, `red`
for hearts/diamonds), never `ink` directly. The un-outlined corner rank glyph is the one place
`text_color(suit)` (true `ink`/`red`, no substitution) is correct, since flat text against
parchment doesn't need the distinction.

## Cards

- **Native size:** 80×112px (5:7, close to a real card's ratio).
- **24 faces** — 4 suits × {9, 10, J, Q, K, A}.
- **Corners:** rank glyph (5×7 bitmap font drawn at 2x block scale — see script) stacked over a
  small outlined suit pip, with a deliberate gap between them, top-left and mirrored (180°)
  bottom-right. Classic card convention. Generous margins on purpose — the pre-critique version
  had the glyph and pip touching with almost no breathing room.
- **Suit pips:** real geometry, not hand-typed bitmaps or crude circle-unions — outlined via
  `pip_sprite()`. Hearts and spades use the actual parametric heart curve
  (`x=16sin³t, y=13cos t − 5cos 2t − 2cos 3t − cos 4t`), not an approximation from overlapping
  circles; spade is that same curve flipped plus a stem — the real heart/spade relationship.
  Clubs are three circles at a wide-enough arrangement radius that a "waist" shows between
  lobes instead of merging into one blob, plus a tapered stem. A mini corner pip and a large
  center pip are the same mask function at a different size, so curves stay round at any scale.
  - **Bug worth remembering:** an early version of the heart/spade flip had the boolean
    inverted — visually the two looked similar enough at a glance that it took drawing explicit
    top/bottom markers on a test render to actually prove which one was upside down. Lesson:
    when a shape's correctness depends on orientation, verify it with an unambiguous visual
    reference, don't eyeball two similar blobs against each other.

## Layout budget — and why it's asserted, not eyeballed

The two corner index blocks sit in fixed reserved rectangles. The forbidden region is
**L-shaped, not a vertical band**: between roughly y=41 and y=99 the card is free almost edge to
edge, which is where arms and held props live. Treating it as one narrow column is what made
earlier drafts look cramped.

Artwork intruding into an index box was a repeat bug across several drafts — including one that
survived visual review because the 2px silhouette outline pushes every shape 2px further out
than its nominal coordinates. `_assert_art_clear_of_indices()` now raises at generation time if
any character pixel lands in a reserved box, so the budget is enforced by the generator rather
than re-checked by eye on every redesign.
- **Number cards (9, 10, A):** center gets one large outlined suit pip.
- **Face cards (J, Q, K):** **full-body avatars**, not busts — directly modelled on Gen 4/5
  Pokémon overworld trainer sprites. That means: a big round head carrying most of the
  characterisation (~40% of figure height), headwear as the primary silhouette signature, a
  small simple body, and **one dark outline around the whole figure** with internal detail
  carried by colour changes and a shadow tone — *not* a heavy outline around each piece. That
  single-silhouette rule is the main thing that separates a Pokémon-sprite look from a
  sticker-collage look, and it's why `composite_sprite()` unions all parts before outlining.
  - **King** — grizzled, gray beard, furrowed brows, 5-peak gold crown, holds a **scepter**.
    A deliberate nod to the single-player opponent rather than a generic storybook king.
  - **Queen** — long auburn hair, gold circlet with a gem, level brows, smiling, holds a **rose**.
  - **Jack** — a knave, not royalty: no crown, tilted cap with a plume, short tunic with visible
    legs and boots, holds a **sword**, and **winks**.
  - Each rank carries a distinct prop and expression. That, more than the headwear alone, is
    what makes the three read as different *people* rather than one body wearing three hats.
  - Sleeves are a contrasting blue against the suit-coloured garment, so the body isn't one flat
    slab; the garment itself stays suit-coloured so red/black still reads at a glance.
- **Card back:** same 80×112 frame, `wood_dark` base with a `wood_med`/`wood_light` diamond
  lattice, `gold` corner accent.

## Table

- **`table_felt.png`** — a 64×64 tileable wood-grain swatch (`wood_dark`/`wood_med`/`wood_light`
  streaks), used as a repeating CSS background for the table surface. Full room ambience (fire,
  window, cat) is out of scope here — that's the Phase 2c "cozy pass."

## Output

All PNGs write to `public/art/` (Vite serves `public/` at the site root unchanged):

```
public/art/cards/{suit}_{rank}.png   × 24
public/art/card_back.png
public/art/table_felt.png
```

## Regenerating

```bash
python3 art/generate_art.py
```

Deterministic — no randomness, so re-running with no spec changes produces byte-identical
PNGs.
