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

## Table

- **`table_felt.png`** — a 64×64 tileable wood-grain swatch, used as a repeating CSS background
  for the table surface. Full room ambience (fire, window, cat) is out of scope here — that's
  the Phase 2c "cozy pass."

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

Deterministic — no randomness, so re-running with no spec changes produces byte-identical PNGs.
