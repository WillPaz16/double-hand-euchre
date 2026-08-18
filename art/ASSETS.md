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

This matches the existing placeholder CSS palette from Phase 2a, so the swap-in is a visual
upgrade, not a palette change.

## Cards

- **Native size:** 40×56px (5:7, close to a real card's ratio).
- **24 faces** — 4 suits × {9, 10, J, Q, K, A}.
- **Corners:** rank glyph (hand-drawn 4×6 bitmap font — see script) stacked over a mini suit
  pip, top-left and mirrored (180°) bottom-right. Classic card convention.
- **Number cards (9, 10, A):** center gets one large suit pip.
- **Face cards (J, Q, K):** center gets a bordered emblem — the rank letter, large, with a
  rank-specific accessory silhouette above it (crown for K, circlet for Q, cap for J) so the
  three read as distinct shapes at a glance, not just a different letter.
  - **Honest note:** the spec's stretch goal was "small hand-styled pixel portraits." What the
    script produces is distinct rank silhouettes/emblems, not faces — procedural facial
    pixel-art reads badly at this size without real hand-touch-up. This is the v1 approximation
    the generator pipeline is built for: swap in real portraits later without touching the
    corner/back/table code.
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
