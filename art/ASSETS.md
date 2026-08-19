# Art assets — spec

Generated deterministically by [`generate_art.py`](generate_art.py) — same approach as
`claude-fairy-pixel-art`: a spec here, a script that draws every asset from math and logic (no
AI image generation, no hand-placed pixels to lose track of), reproducible on every run.

Native pixel grid throughout — assets are drawn small and displayed scaled by a whole-number
factor with `image-rendering: pixelated`, per the "hybrid fixed-grid" approach in the Phase 2
design spec. Never edit the PNGs in `public/art/` directly; edit this spec / the script and
regenerate.

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

- **Native size:** 40×56px (5:7, close to a real card's ratio).
- **24 faces** — 4 suits × {9, 10, J, Q, K, A}.
- **Corners:** rank glyph (hand-drawn 5×7 bitmap font — see script) stacked over a small
  outlined suit pip, top-left and mirrored (180°) bottom-right. Classic card convention.
- **Suit pips:** real geometry (overlapping circles/polygons — `_heart_mask` / `_spade_mask` /
  `_club_mask` / `_diamond_mask`), not hand-typed bitmaps, and outlined via `pip_sprite()`. A
  mini corner pip and a large center pip are the same mask function at a different size, so the
  curves stay properly round at any scale instead of needing a separate asset per size.
- **Number cards (9, 10, A):** center gets one large outlined suit pip.
- **Face cards (J, Q, K):** a chibi bust portrait (big head, small body — `draw_head` /
  `draw_shoulders` / `draw_face` in the script), not a letter in a box. Every rank shares the
  same face-building blocks (round eyes with a highlight dot, brows, blush, a mouth) and
  differs in headwear and expression, built from primitive shapes so proportions are single-line
  tweaks rather than pixel-by-pixel redraws:
  - **King** — old and grizzled, gray beard, furrowed brows, gold crown, no smile. A deliberate
    nod to the single-player opponent rather than a generic storybook king.
  - **Queen** — auburn hair falling past the shoulders, gold circlet, level brows, smiling.
  - **Jack** — a knave, not royalty: no crown, a tilted cap and feather, one raised eyebrow for
    a bit of cheek, smiling.
  - Shoulders/collar are suit-colored, tying each face card back to its suit the same way the
    corner pips do.
- **Card back:** same 40×56 frame, `wood_dark` base with a `wood_med`/`wood_light` diamond
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
