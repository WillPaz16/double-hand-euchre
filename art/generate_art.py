#!/usr/bin/env python3
"""Deterministically generates every pixel-art asset for the euchre UI from the spec in
ASSETS.md. No AI image generation, no hand-placed pixels to lose track of — just math and
logic, so re-running this script always produces the same output. See ASSETS.md before
editing: change the spec/constants below, not the PNGs in public/art/.
"""
import colorsys
import json
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# --- Palette (cabin by the fire) --- see ASSETS.md
PARCHMENT = (238, 222, 186, 255)
PARCHMENT_SHADOW = (214, 194, 150, 255)
INK = (43, 28, 20, 255)
INK_LIGHT = (90, 64, 46, 255)
RED = (176, 58, 46, 255)
GOLD = (212, 165, 74, 255)
WOOD_DARK = (46, 30, 18, 255)
WOOD_MED = (84, 55, 33, 255)
WOOD_LIGHT = (108, 72, 46, 255)
SKIN = (238, 194, 150, 255)
# Four people should not share one complexion. These cost nothing against
# `_assert_sprite_colours`: each sprite is measured on its own, and a character using a
# different base tone SWAPS a colour rather than adding one.
SKIN_WARM = (216, 174, 142, 255)   # ruddier, weathered. Pulled back from (222,168,126):
                                   # `ramp()` raises saturation as it darkens, and at the
                                   # old value the nose shadow and nostril line came back
                                   # frankly RED — a scarlet mark down the middle of the
                                   # one face in the set with nothing (glasses, moustache)
                                   # covering it.
SKIN_TAN = (198, 146, 104, 255)
SKIN_DEEP = (156, 106, 74, 255)
SKIN_FAIR = (234, 202, 180, 255)   # the child's — pale enough that blonde hair still reads
# The card sharp's. She was SKIN_DEEP (156,106,74), a deep brown carried over from a much
# earlier version of the character and never revisited — wrong for who she is. Warm light-medium
# with an even golden ramp (R-G and G-B both 40), deliberately NOT pushed toward yellow: raising
# green against blue is what produces the sallow caricature tint, and it is also simply not what
# skin does. Distinct from SKIN_WARM, which is the Regular's and reads ruddier.
SKIN_GOLDEN = (212, 172, 132, 255)
                                   # DARKER than the face it frames, which is what stops a
                                   # blonde head becoming one undifferentiated light mass.
                                   # Deliberately LESS saturated than SKIN: `ramp()` multiplies
                                   # saturation on the way down, so a warm pale base returned a
                                   # salmon `deep` and her nostril line read as a cut across the
                                   # bridge of her nose.
BLUSH = (223, 138, 118, 255)
BEARD_GRAY = (196, 190, 178, 255)
HAIR_AUBURN = (140, 74, 38, 255)
HAIR_BROWN = (104, 68, 40, 255)
CAP_GREEN = (94, 122, 78, 255)  # the Jack's cap — deliberately not suit-colored, so it reads
# as its own garment against all four suit-colored tunics. Warmed toward moss/homespun green.
BOOT_DARK = (58, 42, 32, 255)
CLOTH_BLUE = (96, 104, 108, 255)   # sleeves — a cool contrast so the body isn't one flat slab,
# and it works against both the red and the soot-brown garments.
STEEL = (172, 178, 188, 255)
ROSE_RED = (198, 72, 66, 255)
LEAF_GREEN = (86, 128, 76, 255)
# --- Environment palette (Phase 2d) ---------------------------------------------------- #
# WOOD_DARK/MED/LIGHT above are intentionally NOT reused or modified here: make_card_back()
# depends on them, and the card art is frozen. These are separate bases, each fed through
# ramp() at use site, plus the cool/warm accents the night-cabin mood needs.
# The value ladder — wall behind floor behind table (Phase 2g.1).
#
# ASSETS.md has always specified this order, but with the numbers "L≈33 → 54 → 62" and the
# admission that they were "asserted BY EYE at full size". Measured, the shipped tiles were
# **L 13.7 → 19.8 → 23.7**: the order was right and the separation was a third of what the
# spec called for, so the three biggest surfaces in the game sat within 10 lightness points of
# each other and the room read as one dark slab. The card art being frozen had quietly
# protected the CARDS from this while the environment drifted for four phases.
#
# These are NOT the spec's literal numbers, and that is deliberate. Mocking the ladder up with
# the real CSS vignette and hearth wash over it showed L 33/54/62 lands on a *daylit* room —
# at L62 the table goes pale and milky and stops reading as wood at all. The spec's numbers
# were never measured, so they are aspirational rather than authoritative. L 27/42/50 keeps
# the night-cabin mood, keeps the wood reading as wood, and still more than DOUBLES the
# separation (10 points -> 23). Hue is preserved exactly; saturation eases down ~12% as
# lightness rises, or warm wood turns peach.
#
# The mood is supposed to come from the LIGHTING layer (vignette, hearth glow, firelight) over
# properly-lit materials — not from painting the materials themselves nearly black, which is
# what left the low-alpha glows with nothing to lift.
TABLE_WOOD = (196, 142, 92, 255)    # L56 — honey-pine, the lit surface the cards sit on
WALL_WOOD = (98, 74, 52, 255)       # L29 — furthest back, recedes
FLOOR_WOOD = (168, 122, 78, 255)    # L48 — between the two
# The cool counterweight. Warm only reads as warm against something cold, and the window is
# the only cold thing in the room — but at the old (24,30,50) it rendered at **L 11.8**,
# darker than the lit parts of the wall it sits on, so the one cool reference in the room was
# contributing nothing but a dark rectangle. Lifted and saturated so it reads as deep BLUE
# rather than as black: still clearly night outside, but now actually blue enough to be the
# thing the firelight is warm against. (`NIGHT_BLUE`, a mid tone, was defined here for four
# phases and referenced exactly nowhere — the glass always used the deep one. Removed.)
NIGHT_BLUE_DEEP = (33, 45, 82, 255)
FROST = (176, 198, 220, 255)
FIRE_CORE = (255, 226, 140, 255)
FIRE_MID = (240, 150, 52, 255)
FIRE_DEEP = (188, 74, 30, 255)
EMBER = (120, 40, 22, 255)
# Warm greys, not neutral ones. These were near-neutral (128,122,116) and the hearth ended
# up the COLDEST object on a screen whose whole premise is that it is the warm one — a fire
# surrounded by cool stone reads as an unlit fireplace with something orange in it. Stone
# beside a fire picks up that fire; nudging the greys toward amber costs nothing and is the
# difference between the hearth belonging to the room and being pasted onto it.
# (`STONE_LIGHT` lived here unused since the hearth was written — the masonry derives its lit
# tone from `ramp(STONE_MED)` instead. Removed with the other two dead constants in 2g.1.)
STONE_MED = (99, 85, 72, 255)
STONE_DARK = (64, 54, 46, 255)
RUG_RED = (128, 52, 46, 255)
RUG_CREAM = (198, 172, 132, 255)
# Two colours added with the wall furniture (2g.4), and chosen as much for WHERE THEY SIT IN
# HUE as for what they are. Audited, 33 of the palette's 41 constants lived inside a single
# 42-degree warm arc (2.7-44.9 deg) with three dead zones — nothing between 45 and 108 deg, and
# no purple/magenta at all — which is the palette-level reason the room read monotone no
# matter how the values were tuned. A daylit picture and a hung coat are the two objects that
# can carry cool mid-hues without contradicting a firelit night cabin, because one is a
# painting of somewhere else and the other is cloth.
PICTURE_SKY = (108, 156, 190, 255)   # H201 — the room's only mid-blue
COAT_GREEN = (68, 96, 78, 255)       # H147 — lands squarely in the 45-108 deg dead zone

PIP_FILL_BLACK = (72, 54, 42, 255)  # a "soot brown" — dark like ink, but visibly distinct from
# the INK outline. Reusing INK as both fill and outline made clubs/spades disappear into their
# own outline entirely; text (which is never outlined) can stay true black.

# Per-suit garment colours (Phase 2e follow-up). body_color() used to return only two values —
# RED for hearts/diamonds, PIP_FILL_BLACK for clubs/spades — which meant a King of Spades and
# a King of Clubs (or a King of Hearts and a King of Diamonds) were IDENTICAL illustrations
# apart from a single small corner pip. That's fine on a real deck, where suit colour has
# always only meant "red or black" and shape carries the rest — but this deck draws large
# character illustrations whose garment IS most of the card's visual area, and readable at a
# glance in the middle of a hand matters more here than fidelity to a two-colour convention.
# Reported directly: players couldn't tell spade and club face cards apart. All four suits now
# get their own hue, not just the two colour-pairs.
DIAMOND_BODY = (196, 120, 40, 255)  # warm amber/rust — distinct from hearts' red, still warm
CLUB_BODY = (58, 96, 64, 255)       # deep forest green — distinct from spades' near-black brown

SUITS = ["clubs", "diamonds", "hearts", "spades"]
RANKS = ["9", "10", "J", "Q", "K", "A"]
RED_SUITS = {"diamonds", "hearts"}
FACE_RANKS = {"J", "Q", "K"}

CARD_W, CARD_H = 100, 140  # 5:7, the real playing-card ratio (20x5 by 20x7)
OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "art")


def darken(color, factor=0.68):
    """One derived shadow tone per material — keeps the palette from exploding while still
    giving every shape the 2-tone look that reads as pixel-art rather than flat vector."""
    r, g, b, a = color
    return (int(r * factor), int(g * factor), int(b * factor), a)


# --- Phase 2d foundation: tonal ramps, sprite sheets, contact shadows ------------------- #
# darken() above is deliberately left untouched: every card sprite runs through it, and the
# 24 card faces are already approved. These are ADDITIVE and used only by environment art.


def _clamp(v):
    return max(0, min(255, int(v)))


def _shift(color, amount, tint):
    """Move a colour toward white (amount > 0) or black (amount < 0), with a hue `tint`.

    Both the lightening and the tint are scaled by each channel's remaining HEADROOM in the
    direction of travel, so neither can ever clamp. That scaling is the whole point:

    An earlier version multiplied by a factor and then added a flat tint. On mid-dark colours
    that worked, which is exactly why it shipped — it was only ever eyeballed on a brown. On
    bright or saturated colours it inverted the intended hue shift, because clamping silently
    discards the tint on any channel already near 255:
        FIRE_CORE (255,226,140) -> (255,255,166): red AND green pinned, so the "warm"
            highlight differed from base only in blue and read *greener*.
        FROST     (176,198,220) -> (234,254,255): clamped to cyan-white, so the highlight
            bent *cool* — the exact opposite of what the docstring claimed.
    Scaling by headroom keeps the hue relationship intact at any brightness.
    """
    r, g, b, a = color
    out = []
    for channel, t in zip((r, g, b), tint):
        if amount >= 0:
            headroom = 255 - channel
            value = channel + headroom * amount
        else:
            value = channel * (1 + amount)
            headroom = value
        out.append(_clamp(value + t * headroom / 255))
    return tuple(out) + (a,)


def _mix(a, b, t):
    """Blend two colours. Used to compress a ramp toward its base tone — a backdrop
    wants form without competing for attention."""
    return tuple(_clamp(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (a[3],)


# Hue bias applied to highlights; shadows get the negation. Warm is firelight (the default,
# since the hearth lights most of this room); cool is moonlight/snow through the window.
WARM_BIAS = (18, 7, -12)
COOL_BIAS = (-14, -3, 18)


# (lightness delta, hue rotation in degrees, saturation multiplier) for
# highlight / base / shadow / deep, under WARM light. `warm=False` negates the rotations.
RAMP_STEPS = (
    (+0.090, +12.0, 0.95),
    (0.0, 0.0, 1.00),
    (-0.100, -9.0, 1.06),
    (-0.190, -16.0, 1.10),
)


def _desat(c, t):
    """Pull a colour t of the way toward its own luminance grey, keeping its lightness.

    `ramp()` MULTIPLIES saturation on the way down (RAMP_STEPS: 1.06 at shadow, 1.10 at deep).
    That is right for cloth — a red coat's shadow really is a richer red — and wrong for skin.
    Measured on the Regular's face at 8x: base SKIN_WARM (216,174,142), R-G gap 42; his shadow
    came back (206,131,101), R-G gap **75**. Almost the same lightness, nearly double the
    chroma. A face built out of that does not read as modelled, it reads as blotchy pink, which
    is exactly the word the client used. Desaturating the shadow instead of darkening it
    further is what turns those patches back into shading.
    """
    y = round(0.30 * c[0] + 0.59 * c[1] + 0.11 * c[2])
    return _mix(c, (y, y, y, c[3]), t)


def ramp(color, warm=True):
    """Four tones — (highlight, base, shadow, deep) — with a real temperature split.

    Under warm light, highlights bend toward the light (amber) and shadows bend away from it;
    `warm=False` negates the rotation for anything lit by the window instead of the fire. That
    split is what stops an environment reading muddy: with nothing cool in frame, warm
    firelight has nothing to be warm *against*.

    **Rebuilt in HLS in Phase 2g.1, because the RGB version was not delivering any of that.**
    Measured on the shipped palette, the old `_shift`-based ramp:

      - **Blew out its highlight.** `TABLE_WOOD` base L50 -> highlight L66; `WALL_WOOD` L27 ->
        L52, with saturation collapsing 27% -> 18%. Nearly every call site immediately
        `_mix()`ed it 40-55% back toward base, which is the code telling you the amplitude was
        wrong.
      - **Never actually rotated shadows cool.** `TABLE_WOOD` base H23.0 -> shadow H21.7 ->
        deep H22.1. **Under 1.5 degrees.** The cool-shadow half — the thing the old docstring
        called "the single highest-impact idea of this phase" — measurably was not happening.
        The tint was scaled by each channel's remaining headroom, which on a dark shadow is
        tiny, so it was swamped every time.
      - **Went grey on cool bases.** `ramp(NIGHT_BLUE_DEEP)` returned a highlight at **S 3.9%**
        — a dead neutral.

    Working in HLS fixes all three at once, because lightness, hue and saturation stop
    fighting for the same three channels: each step states what it wants directly. Clamping
    lightness (rather than clamping RGB) also preserves the "hue never inverts at the
    extremes" guarantee `_shift` was written to provide — which is why `_shift` is still the
    right tool for `light_from`'s small nudges and the wrong one for a full ramp.
    """
    h, l, s = colorsys.rgb_to_hls(*[v / 255.0 for v in color[:3]])
    out = []
    for dl, dh, ds in RAMP_STEPS:
        rot = dh if warm else -dh
        nh = ((h * 360.0 + rot) % 360.0) / 360.0
        # Clamped short of pure black/white so a tone can never lose its hue entirely.
        nl = max(0.04, min(0.96, l + dl))
        ns = max(0.0, min(1.0, s * ds))
        out.append(tuple(round(v * 255) for v in colorsys.hls_to_rgb(nh, nl, ns)) + (color[3],))
    return tuple(out)


def make_sprite_sheet(frames):
    """Paste equal-sized frames into one horizontal strip for CSS steps() animation.
    See ASSETS.md: the CSS animates transform (compositor-only), never background-position
    (which repaints every frame)."""
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0), frame)
    return sheet


LIGHT_BANDS = 5


def light_from(sprite, strength=0.16, from_left=True, bands=LIGHT_BANDS):
    """Relight a finished sprite directionally, as a post-process, in DISCRETE BANDS.

    **The measurement that prompted this.** Comparing the mean luminance of each scene
    sprite's left half against its right half gave deltas under 1 unit for every single one:
    the fireplace, the cat, the shelf, the seated figure. Every object was shaded purely
    top-down, so nothing in the room had a light *direction* — and a room whose objects agree
    on where the light is not coming from reads as stickers on a backdrop no matter how good
    the gradient painted over them is.

    The room's light source is the hearth, in the left margin. So scene sprites get their
    hearth-facing side lifted and their far side dropped, across a horizontal ramp.

    **Why banded, and not the smooth ramp this used to be (Phase 2g.1).** The original
    computed `amt` continuously from `x`, giving every column its own slightly different tint.
    Measured on the shipped Old-Timer that produced **361 colours on one 150x140 sprite**,
    including ~50 skin tones within 4 RGB units of each other — (239,196,146), (239,197,148),
    (239,195,145)… A Stardew-class character sprite carries 12-25 colours *total*. That is not
    shading, it is an airbrush gradient wearing pixel art's clothes, and it was the real
    technical answer to "everything is still very not pixelated" — the same defect class as
    the `border-radius: 50%` felt retired in the pixelation pass, just on sprites instead of
    a silhouette.

    Quantising `t` into a handful of bands before deriving `amt` means a whole REGION shares
    one tone, which is what makes a shading step legible as a step. Measured: the same sprite
    drops to ~17 colours, inside the reference range, with no redrawing at all.

    `bands` is odd on purpose, so one band sits at `amt == 0` and the sprite keeps its authored
    mid-tone rather than every pixel being pushed one way or the other.

    Applied as a post-process on the composited sprite rather than threaded through every
    generator: it is one call per object instead of a light model in a dozen drawing
    functions, and it cannot possibly reach the cards, which are frozen. Deliberately subtle —
    at strength much above ~0.2 pixel art starts to look airbrushed rather than shaded.
    """
    px = sprite.load()
    w, h = sprite.size
    for x in range(w):
        t = x / (w - 1) if w > 1 else 0.5
        if not from_left:
            t = 1.0 - t
        # Snap to a band CENTRE. Flooring to the band edge instead would bias the whole
        # sprite toward its lit side, since band 0 would light from t=0 rather than t=1/2N.
        t = (min(int(t * bands), bands - 1) + 0.5) / bands
        # +strength at the lit edge falling to -strength at the far edge.
        amt = strength * (1.0 - 2.0 * t)
        if amt == 0:
            continue
        for y in range(h):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if amt > 0:
                px[x, y] = _shift((r, g, b, a), amt, WARM_BIAS)
            else:
                px[x, y] = _shift((r, g, b, a), amt, tuple(-v for v in WARM_BIAS))
    return sprite


# --- 2x pixel grid (Phase 2e.1) ----------------------------------------------------------- #
# Card art at 100x140 with 1px-precise strokes (draw_face's `width=2` lines, single-pixel eye
# highlights, GLYPH_SCALE=2 rank glyphs) reads as smooth line art at 1:1 — the apparent "pixel"
# is one screen pixel, not the 2+ screen pixels every Pokemon/Stardew reference maps one art
# pixel to. Nothing about the CANVAS size changes here (still 100x140, so no CSS or layout is
# touched) — only what the pixels inside it are allowed to look like.
#
# Rather than hand-doubling every coordinate across draw_face, the pip masks, and the glyph
# table — a large, error-prone rewrite of code that has no other reason to change — this snaps
# the FINISHED image to the grid as a last step: downsample by PX with NEAREST (which keeps
# whichever single pixel lands on each PX x PX block, with no blending, since nothing in this
# file draws anti-aliased edges), then upsample back with NEAREST. Every existing composition,
# proportion and colour choice is unchanged; only the finest 1px detail gets pulled onto a
# coarser grid. It is the same trick real pixel-art pipelines use to enforce a grid on
# freehand work, and it is mechanical enough to apply everywhere at once instead of asset by
# asset.
PX = 2


def snap_to_pixel_grid(img: Image.Image, px: int = PX) -> Image.Image:
    w, h = img.size
    assert w % px == 0 and h % px == 0, f"{w}x{h} is not a multiple of {px}"
    small = img.resize((w // px, h // px), Image.NEAREST)
    return small.resize((w, h), Image.NEAREST)


def _assert_pixel_grid(img: Image.Image, px: int = PX, label: str = "") -> None:
    """Fails if `img` has any detail finer than the PX grid. Round-tripping an image that is
    ALREADY on the grid through downsample-then-upsample is a no-op by construction, so this
    is a cheap, exact check rather than a heuristic — the same kind of build-time guardrail as
    `_assert_art_clear_of_indices`, which already caught two bugs visual review missed."""
    if snap_to_pixel_grid(img, px).tobytes() != img.tobytes():
        raise AssertionError(f"{label or 'image'} has detail finer than the {px}px grid")


def contact_shadow(w, h, layers=3, max_alpha=104):
    """A stepped dark ellipse to sit under an object so it reads as resting on a surface
    rather than floating. Deliberately stepped rather than gaussian-blurred — a soft blur
    would break the hard-edged pixel-art look everything else follows."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i in range(layers):
        t = i / layers
        ix, iy = w * 0.25 * t, h * 0.25 * t
        draw.ellipse((ix, iy, w - 1 - ix, h - 1 - iy),
                     fill=(0, 0, 0, int(max_alpha * (i + 1) / layers)))
    return img


def text_color(suit: str):
    """For the un-outlined corner rank glyph — wants maximum contrast against parchment."""
    return RED if suit in RED_SUITS else INK


def body_color(suit: str):
    """For anything outlined (pips, garments) — needs to differ from the INK outline itself,
    which pure black/INK does not. One colour per suit (see DIAMOND_BODY/CLUB_BODY above), not
    per colour-pair — the garment is the biggest legible signal a face card has."""
    return {
        "hearts": RED,
        "diamonds": DIAMOND_BODY,
        "spades": PIP_FILL_BLACK,
        "clubs": CLUB_BODY,
    }[suit]


# --- Layout / collision budget ----------------------------------------------------------- #
# The corner rank+pip blocks sit in two fixed reserved boxes — top-left and bottom-right:
#   left index  x = 6 .. 24,  y = 6 .. 35
#   right index x = 76 .. 94, y = 105 .. 134
# So the forbidden region is L-shaped, NOT a vertical band: between y=35 and y=105 the card is
# free almost edge to edge. Headwear/hem must respect the ~24 half-width limit, but arms and
# held props live in that free middle band and can reach much further out. Getting this wrong
# (treating it as one narrow column) is what made earlier drafts look cramped.
INDEX_MARGIN = 6
INDEX_PIP = 12
CHAR_SAFE_X = (28, 72)
CX = CARD_W // 2

# Character vertical plan (Pokemon overworld-sprite proportions: head ~43% of total height,
# small simple body, short legs).
HAT_TOP = 16
HEAD_TOP = 29
HEAD_CY = 51
HEAD_RX, HEAD_RY = 21, 22
SHOULDER_Y = 70
HEM_Y = 118


# --- Sprite compositing ------------------------------------------------------------------ #
# Pokemon overworld sprites carry ONE dark outline around the whole character silhouette, with
# internal detail expressed through colour changes and a shadow tone — not a heavy outline
# around every individual piece. So parts are painted into a shared canvas, their union is
# outlined once, and each part gets a bottom-right shadow band (light from the top-left).


def _shadow_band(mask, depth=2):
    return ImageChops.subtract(mask, ImageChops.offset(mask, -depth, -depth))


def composite_sprite(w, h, parts, outline=INK, outline_px=2, pad=5, shade_depth=2):
    """`parts` is a list of (draw_fn, color) painted in order — later parts cover earlier ones.
    Returns (sprite, pad); paste at (x - pad, y - pad) so local (0,0) lands at (x, y)."""
    cw, ch = round(w + pad * 2), round(h + pad * 2)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    union = Image.new("L", (cw, ch), 0)

    for draw_fn, color in parts:
        mask = Image.new("L", (cw, ch), 0)
        draw_fn(ImageDraw.Draw(mask), pad, pad)
        canvas.paste(Image.new("RGBA", (cw, ch), color), (0, 0), mask)
        if shade_depth:
            canvas.paste(
                Image.new("RGBA", (cw, ch), darken(color)), (0, 0), _shadow_band(mask, shade_depth)
            )
        union = ImageChops.lighter(union, mask)

    ring = ImageChops.subtract(union.filter(ImageFilter.MaxFilter(outline_px * 2 + 1)), union)
    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (cw, ch), outline), (0, 0), ring)
    out.paste(canvas, (0, 0), canvas)
    return out, pad


def paste(card: Image.Image, sprite_and_pad, x, y) -> None:
    sprite, pad = sprite_and_pad
    card.paste(sprite, (round(x - pad), round(y - pad)), sprite)


# --- Bold 5x7 bitmap font, drawn at 2x block scale — only the glyphs a euchre deck needs. -- #
GLYPHS = {
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "J": ["...#.", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "A": ["..#..", ".#.#.", "#...#", "#...#", "#####", "#...#", "#...#"],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "6": [".##..", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
}
GLYPH_SCALE = 2


def draw_glyph(draw: ImageDraw.ImageDraw, x, y, glyph, color, scale=GLYPH_SCALE) -> None:
    for row_i, row in enumerate(glyph):
        for col_i, ch in enumerate(row):
            if ch == "#":
                px, py = x + col_i * scale, y + row_i * scale
                draw.rectangle((px, py, px + scale - 1, py + scale - 1), fill=color)


# --- Suit pips ---------------------------------------------------------------------------- #
# Hearts/spades come from the true parametric heart curve, not circle unions. Spade is that
# same curve flipped plus a stem. Clubs are three lobes at a wide-enough arrangement radius to
# keep a visible waist between them, with a NARROW stem that flares only at the foot — the
# previous version's thick trunk was what made it read as a tree rather than a clover.


def _heart_curve_points(w, h, ox, oy, steps=96, lobes_up=True):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x, y))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    out = []
    for x, y in pts:
        nx, ny = (x - minx) / (maxx - minx), (y - miny) / (maxy - miny)
        if lobes_up:
            ny = 1 - ny
        out.append((ox + nx * w, oy + ny * h))
    return out


def _stem(d, ox, oy, w, h, top_frac, top_w_frac, foot_w_frac):
    cx = ox + w / 2
    top_w, foot_w = w * top_w_frac, w * foot_w_frac
    d.polygon(
        [
            (cx - top_w / 2, oy + h * top_frac),
            (cx + top_w / 2, oy + h * top_frac),
            (cx + foot_w / 2, oy + h),
            (cx - foot_w / 2, oy + h),
        ],
        fill=255,
    )


def _heart_mask(w, h):
    def fn(d, ox, oy):
        d.polygon(_heart_curve_points(w, h, ox, oy, lobes_up=True), fill=255)

    return fn


def _spade_mask(w, h):
    def fn(d, ox, oy):
        d.polygon(_heart_curve_points(w, h * 0.76, ox, oy, lobes_up=False), fill=255)
        _stem(d, ox, oy, w, h, top_frac=0.58, top_w_frac=0.09, foot_w_frac=0.34)

    return fn


def _diamond_mask(w, h):
    def fn(d, ox, oy):
        # Slightly narrower than tall — a 1:1 rhombus reads squat next to the other three.
        half_w = w * 0.42
        cx, cy = ox + w / 2, oy + h / 2
        d.polygon([(cx, oy), (cx + half_w, cy), (cx, oy + h), (cx - half_w, cy)], fill=255)

    return fn


def _club_mask(w, h):
    def fn(d, ox, oy):
        lobe_r = w * 0.235
        for lx, ly in ((0.5, 0.24), (0.27, 0.55), (0.73, 0.55)):
            cx, cy = ox + w * lx, oy + h * ly
            d.ellipse((cx - lobe_r, cy - lobe_r, cx + lobe_r, cy + lobe_r), fill=255)
        _stem(d, ox, oy, w, h, top_frac=0.52, top_w_frac=0.10, foot_w_frac=0.30)

    return fn


PIP_MASKS = {"hearts": _heart_mask, "diamonds": _diamond_mask, "spades": _spade_mask, "clubs": _club_mask}


def pip_sprite(suit: str, size, fill, outline_px=2, shade_depth=2):
    return composite_sprite(
        size,
        size,
        [(PIP_MASKS[suit](size, size), fill)],
        outline_px=outline_px,
        pad=outline_px + 2,
        shade_depth=shade_depth,
    )


def draw_card_frame(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), fill=PARCHMENT)
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=INK, width=2)
    draw.rectangle((3, 3, CARD_W - 4, CARD_H - 4), outline=PARCHMENT_SHADOW)


def paste_corners(card: Image.Image, rank: str, suit: str) -> None:
    text, body = text_color(suit), body_color(suit)
    pip_img, _ = pip_sprite(suit, INDEX_PIP, body, outline_px=1, shade_depth=1)

    two_digit = rank == "10"
    glyph_w = 8 + 10 if two_digit else 10  # tightened kerning on "10" keeps the block narrow
    block_w = max(glyph_w, pip_img.width)
    glyph_h, gap = 14, 3
    block_h = glyph_h + gap + pip_img.height

    marker = Image.new("RGBA", (block_w, block_h), (0, 0, 0, 0))
    mdraw = ImageDraw.Draw(marker)
    if two_digit:
        draw_glyph(mdraw, 0, 0, GLYPHS["1"], text)
        draw_glyph(mdraw, 8, 0, GLYPHS["0"], text)
    else:
        draw_glyph(mdraw, 0, 0, GLYPHS[rank], text)
    marker.paste(pip_img, ((block_w - pip_img.width) // 2, glyph_h + gap), pip_img)

    card.paste(marker, (INDEX_MARGIN, INDEX_MARGIN), marker)
    flipped = marker.rotate(180)
    card.paste(flipped, (CARD_W - block_w - INDEX_MARGIN, CARD_H - block_h - INDEX_MARGIN), flipped)


# The real pip count for a 9 or a 10 — this used to draw exactly ONE big pip for every number
# rank (Ace included), which is correct for an Ace but was quietly wrong for the 9 and the 10,
# the two ranks whose entire visual identity on a real deck IS the pip count. Positions follow
# the standard Anglo-American layout: two columns of four, which is 8 on its own (a real "8"),
# plus rank-specific extras — a dead-centre ninth pip for the 9, or a pip inserted between each
# pair of rows on the centreline for the 10. Kept out of `_index_boxes`' reserved corners by
# construction (see the column-x comment below), not by trial and error.
_PIP_ROWS = (26, 58, 90, 122)
_PIP_COL_L, _PIP_COL_R = 34, 66  # clears both corner index boxes on X alone — any Y is safe
_PIP_SIZE = 14


def _pip_positions(rank: str) -> list[tuple[int, int]]:
    if rank == "A":
        return [(CX, 70)]  # unchanged: an Ace shows exactly one large pip
    positions = [(x, y) for y in _PIP_ROWS for x in (_PIP_COL_L, _PIP_COL_R)]  # the shared 8
    if rank == "9":
        positions.append((CX, 74))  # dead centre — the traditional 9th pip
    elif rank == "10":
        # Between the two row-pairs, not above/below them: the safe vertical band only needs
        # to hold the existing 4 rows, and CX is clear of both index boxes at any Y anyway.
        positions.append((CX, (_PIP_ROWS[0] + _PIP_ROWS[1]) // 2))
        positions.append((CX, (_PIP_ROWS[2] + _PIP_ROWS[3]) // 2))
    return positions


def _assert_pips_clear_of_indices(positions, half, rank, label):
    """Same guardrail as `_assert_art_clear_of_indices`, expressed directly against pip centres
    and a bounding half-size instead of an alpha channel — cheaper and exact for circles-on-a-
    grid rather than an arbitrary composited silhouette."""
    for bx0, by0, bx1, by1 in _index_boxes(rank):
        for x, y in positions:
            if x - half < bx1 and x + half > bx0 and y - half < by1 and y + half > by0:
                raise AssertionError(
                    f"{label}: pip at ({x},{y}) intrudes into reserved index box "
                    f"({bx0},{by0})-({bx1},{by1})"
                )


def make_number_card(rank: str, suit: str) -> Image.Image:
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw_card_frame(ImageDraw.Draw(card))
    positions = _pip_positions(rank)
    size = 48 if rank == "A" else _PIP_SIZE
    _assert_pips_clear_of_indices(positions, size / 2, rank, f"{rank} of {suit}")
    for x, y in positions:
        paste(card, pip_sprite(suit, size, body_color(suit), outline_px=3 if rank == "A" else 2),
              x - size / 2, y - size / 2)
    paste_corners(card, rank, suit)
    card = snap_to_pixel_grid(card)
    _assert_pixel_grid(card, label=f"{rank} of {suit}")
    return card


# --- Face-card characters ----------------------------------------------------------------- #
# Full-body avatars in the spirit of Gen 4/5 Pokemon overworld trainer sprites: a big round
# head doing most of the characterisation, headwear as the primary silhouette signature, a
# small simple body, and a single outline around the whole figure. King and Queen wear
# floor-length robes (a wide triangular base); the Jack, a knave rather than royalty, has a
# short tunic with visible legs and boots — so all three are separable by silhouette alone.

SAFE_L, SAFE_R = CHAR_SAFE_X
SAFE_HALF = (SAFE_R - SAFE_L) / 2


def _ellipse(x0, y0, x1, y1):
    def fn(d, ox, oy):
        d.ellipse((ox + x0, oy + y0, ox + x1, oy + y1), fill=255)

    return fn


def _poly(points):
    def fn(d, ox, oy):
        d.polygon([(ox + px, oy + py) for px, py in points], fill=255)

    return fn


def _robe(top_half, hem_half, top_y=SHOULDER_Y, hem_y=HEM_Y):
    return _poly(
        [
            (CX - top_half, top_y),
            (CX + top_half, top_y),
            (CX + hem_half, hem_y),
            (CX - hem_half, hem_y),
        ]
    )


def _head():
    return _ellipse(CX - HEAD_RX, HEAD_CY - HEAD_RY, CX + HEAD_RX, HEAD_CY + HEAD_RY)


def _fringe(half_w, top_y, bottom_y, teeth=5):
    """Hair falling over the brow with a jagged 'bangs' edge — the single most recognisable
    cue in a Pokemon trainer sprite's head."""
    pts = [(CX - half_w, top_y), (CX + half_w, top_y), (CX + half_w, bottom_y - 5)]
    for i in range(teeth + 1):
        fx = CX + half_w - (2 * half_w) * i / teeth
        pts.append((fx, bottom_y if i % 2 == 0 else bottom_y - 7))
    pts.append((CX - half_w, bottom_y - 5))
    return _poly(pts)


def _hand(side, y=98, dx=21, r=5):
    def fn(d, ox, oy):
        cx = ox + CX + side * dx
        d.ellipse((cx - r, oy + y - r, cx + r, oy + y + r), fill=255)

    return fn


def _arm(side, top_y=SHOULDER_Y, bot_y=96, inner=13, width=8, flare=4):
    """A sleeved arm angling out from the shoulder. Lives in the free middle band of the card
    (see the L-shaped safe-zone note above), which is what lets the figure have a real
    silhouette instead of a featureless slab."""
    return _poly(
        [
            (CX + side * inner, top_y),
            (CX + side * (inner + width), top_y),
            (CX + side * (inner + width + flare), bot_y),
            (CX + side * (inner + flare), bot_y),
        ]
    )


def _sculpted_hair(top_y, top_half, waist_y, waist_half, bottom_y, bottom_half):
    """Hair as a shaped mass — hugging the skull, flaring at the jaw/shoulder, then tapering.
    A plain ellipse behind the head reads as a rectangular slab at this size."""
    return _poly(
        [
            (CX - top_half, top_y),
            (CX + top_half, top_y),
            (CX + waist_half, waist_y),
            (CX + bottom_half, bottom_y),
            (CX - bottom_half, bottom_y),
            (CX - waist_half, waist_y),
        ]
    )


def _hem_trim(hem_y, half):
    return _poly(
        [(CX - half + 1, hem_y - 5), (CX + half - 1, hem_y - 5), (CX + half, hem_y), (CX - half, hem_y)]
    )


def _collar():
    return _poly([(CX - 8, SHOULDER_Y - 1), (CX + 8, SHOULDER_Y - 1), (CX, SHOULDER_Y + 8)])


def draw_face(card: Image.Image, *, brow_color, brow_angle=0, mouth="smile", eyes="open",
              eye_y=HEAD_CY - 1):
    """Big round eyes with a sparkle, brows, blush. Drawn after the silhouette outline since
    they sit wholly inside it. `eyes="wink"` closes the right eye to an arc — the cheapest
    possible way to give one character a distinct personality beat."""
    d = ImageDraw.Draw(card)
    for side in (-1, 1):
        ex = CX + side * 8
        if eyes == "wink" and side > 0:
            d.arc((ex - 4, eye_y - 4, ex + 4, eye_y + 4), start=200, end=340, fill=INK, width=2)
        else:
            d.ellipse((ex - 3, eye_y - 4, ex + 3, eye_y + 4), fill=INK)
            d.rectangle((ex - 2, eye_y - 3, ex - 1, eye_y - 2), fill=(255, 255, 255, 255))

    by = eye_y - 9
    for side in (-1, 1):
        x_out, x_in = CX + side * 13, CX + side * 4
        if brow_angle == 0:
            d.line((x_out, by, x_in, by), fill=brow_color, width=2)
        elif brow_angle > 0:  # furrowed V — stern King
            d.line((x_out, by - 2, x_in, by + 3), fill=brow_color, width=2)
        else:  # one raised — cheeky Jack
            d.line((x_out, by, x_in, by - 4) if side < 0 else (x_out, by + 2, x_in, by + 2),
                   fill=brow_color, width=2)

    for side in (-1, 1):
        bx = CX + side * 14
        d.ellipse((bx - 3, eye_y + 6, bx + 3, eye_y + 9), fill=BLUSH)

    my = eye_y + 11
    if mouth == "smile":
        d.arc((CX - 6, my - 5, CX + 6, my + 4), start=15, end=165, fill=INK, width=2)
    elif mouth == "flat":
        d.line((CX - 4, my, CX + 4, my), fill=INK, width=2)


def _index_boxes(rank: str):
    """The two rectangles paste_corners() reserves — kept in sync with it by deriving from the
    same constants."""
    pip_w = INDEX_PIP + 6  # pip_sprite pads by outline_px+2 on each side
    glyph_w = 8 + 10 if rank == "10" else 10
    bw, bh = max(glyph_w, pip_w), 14 + 3 + pip_w
    return [
        (INDEX_MARGIN, INDEX_MARGIN, INDEX_MARGIN + bw, INDEX_MARGIN + bh),
        (CARD_W - bw - INDEX_MARGIN, CARD_H - bh - INDEX_MARGIN,
         CARD_W - INDEX_MARGIN, CARD_H - INDEX_MARGIN),
    ]


def _assert_art_clear_of_indices(sprite, pad, rank, label):
    """Guardrail: centred artwork must never intrude into a reserved corner index box.
    Overlap there was a repeat visual bug across several drafts, so the layout budget is
    asserted here rather than eyeballed on every redesign."""
    alpha = sprite.split()[3]
    for bx0, by0, bx1, by1 in _index_boxes(rank):
        for y in range(by0, by1):
            for x in range(bx0, bx1):
                if alpha.getpixel((x + pad, y + pad)) > 0:
                    raise AssertionError(
                        f"{label}: artwork intrudes into reserved index box at card ({x},{y})"
                    )


def make_face_card(rank: str, suit: str) -> Image.Image:
    """Full-body avatars in the spirit of Gen 4/5 Pokemon overworld trainer sprites: a big round
    head doing most of the characterisation, headwear as the primary silhouette signature, a
    small body, and ONE outline around the whole figure. Each rank also carries a prop, which is
    what makes the three read as different people rather than one body with three hats."""
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw_card_frame(ImageDraw.Draw(card))
    garment = body_color(suit)

    if rank == "K":
        parts = [
            (_sculpted_hair(HEAD_TOP + 2, 18, 62, 22, 76, 16), BEARD_GRAY),
            (_arm(-1), CLOTH_BLUE),
            (_arm(1), CLOTH_BLUE),
            (_robe(17, 23), garment),
            (_hem_trim(HEM_Y, 22), GOLD),
            # Scepter, held just clear of the robe edge so it reads as a separate object
            # rather than a gold stripe painted down the garment.
            (_poly([(CX + 20, 56), (CX + 24, 56), (CX + 24, 94), (CX + 20, 94)]), GOLD),
            (_ellipse(CX + 16, 44, CX + 28, 56), GOLD),
            (_hand(-1, y=94), SKIN),
            (_hand(1, dx=17, y=92), SKIN),
            (_collar(), GOLD),
            (_head(), SKIN),
            (_fringe(HEAD_RX - 2, HEAD_TOP + 1, HEAD_TOP + 15), BEARD_GRAY),
            # Long tapered beard — a rounded shape, not the flat gray bib a trapezoid gives.
            (_poly([
                (CX - 12, 60), (CX - 14, 70), (CX - 11, 82), (CX - 5, 90),
                (CX + 5, 90), (CX + 11, 82), (CX + 14, 70), (CX + 12, 60),
            ]), BEARD_GRAY),
            # Crown: five peaks, the widest headwear of the three.
            (_poly([
                (CX - 24, HAT_TOP + 18), (CX - 24, HAT_TOP + 6), (CX - 16, HAT_TOP + 13),
                (CX - 8, HAT_TOP - 1), (CX, HAT_TOP + 11), (CX + 8, HAT_TOP - 1),
                (CX + 16, HAT_TOP + 13), (CX + 24, HAT_TOP + 6), (CX + 24, HAT_TOP + 18),
            ]), GOLD),
        ]
        sprite = composite_sprite(CARD_W, CARD_H, parts)
        _assert_art_clear_of_indices(*sprite, rank, f"{rank} of {suit}")
        paste(card, sprite, 0, 0)
        draw_face(card, brow_color=BEARD_GRAY, brow_angle=1, mouth=None)

    elif rank == "Q":
        parts = [
            (_sculpted_hair(HEAD_TOP, 17, 72, 23, 104, 18), HAIR_AUBURN),
            (_arm(-1), CLOTH_BLUE),
            (_arm(1), CLOTH_BLUE),
            (_robe(17, 23), garment),
            (_hem_trim(HEM_Y, 22), GOLD),
            # A rose, held clear of the gown so the bloom isn't half-buried in it.
            (_poly([(CX - 26, 88), (CX - 23, 88), (CX - 23, 100), (CX - 26, 100)]), LEAF_GREEN),
            (_ellipse(CX - 31, 76, CX - 19, 88), ROSE_RED),
            (_hand(-1, dx=23, y=96), SKIN),
            (_hand(1, dx=17, y=94), SKIN),
            (_collar(), GOLD),
            (_head(), SKIN),
            (_fringe(HEAD_RX - 1, HEAD_TOP, HEAD_TOP + 14), HAIR_AUBURN),
            (_poly([                                                            # circlet + gem
                (CX - 16, HEAD_TOP + 6), (CX + 16, HEAD_TOP + 6),
                (CX + 16, HEAD_TOP + 10), (CX - 16, HEAD_TOP + 10),
            ]), GOLD),
            (_ellipse(CX - 4, HEAD_TOP - 1, CX + 4, HEAD_TOP + 7), GOLD),
        ]
        sprite = composite_sprite(CARD_W, CARD_H, parts)
        _assert_art_clear_of_indices(*sprite, rank, f"{rank} of {suit}")
        paste(card, sprite, 0, 0)
        draw_face(card, brow_color=HAIR_AUBURN, brow_angle=0, mouth="smile")

    else:  # J — short tunic, visible legs and boots, tilted cap with a plume, and a sword.
        parts = [
            (_poly([(CX - 12, 110), (CX - 1, 110), (CX - 1, HEM_Y), (CX - 12, HEM_Y)]), BOOT_DARK),
            (_poly([(CX + 1, 110), (CX + 12, 110), (CX + 12, HEM_Y), (CX + 1, HEM_Y)]), BOOT_DARK),
            (_poly([(CX - 9, 100), (CX - 2, 100), (CX - 2, 112), (CX - 9, 112)]), INK_LIGHT),
            (_poly([(CX + 2, 100), (CX + 9, 100), (CX + 9, 112), (CX + 2, 112)]), INK_LIGHT),
            (_arm(-1, bot_y=94), CLOTH_BLUE),
            (_arm(1, bot_y=94), CLOTH_BLUE),
            (_robe(17, 19, hem_y=102), garment),
            (_hem_trim(102, 18), GOLD),
            (_poly([(CX - 18, 86), (CX + 18, 86), (CX + 18, 92), (CX - 18, 92)]), BOOT_DARK),  # belt
            # Sword, angled up and out into the free middle band. The crossguard is kept small
            # and in line with the blade — a wide horizontal guard read as a gold bar laid
            # across the tunic rather than as a weapon.
            (_poly([
                (CX + 20, 88), (CX + 26, 58), (CX + 30, 56), (CX + 29, 64), (CX + 24, 90),
            ]), STEEL),
            (_poly([(CX + 18, 94), (CX + 24, 86), (CX + 27, 88), (CX + 21, 96)]), GOLD),
            (_hand(-1, y=92), SKIN),
            (_hand(1, y=94, dx=17), SKIN),
            (_collar(), GOLD),
            (_head(), SKIN),
            (_fringe(HEAD_RX - 2, HEAD_TOP + 2, HEAD_TOP + 14), HAIR_BROWN),
            (_ellipse(CX - 21, HAT_TOP + 4, CX + 17, HAT_TOP + 20), CAP_GREEN),  # tilted cap
            # Plume — tapered, and kept inside the card frame. An earlier thin triangle ran off
            # the top edge and got clipped by the border.
            (_poly([
                (CX + 11, HAT_TOP + 12), (CX + 16, HAT_TOP + 1), (CX + 23, HAT_TOP - 6),
                (CX + 22, HAT_TOP + 3), (CX + 18, HAT_TOP + 11),
            ]), GOLD),
        ]
        sprite = composite_sprite(CARD_W, CARD_H, parts)
        _assert_art_clear_of_indices(*sprite, rank, f"{rank} of {suit}")
        paste(card, sprite, 0, 0)
        draw_face(card, brow_color=HAIR_BROWN, brow_angle=-1, mouth="smile", eyes="wink")

    paste_corners(card, rank, suit)
    card = snap_to_pixel_grid(card)
    _assert_pixel_grid(card, label=f"{rank} of {suit}")
    return card


# --- Old-Timer opponent portrait ---------------------------------------------------------- #
# A deliberately different character from the face-card royalty: where the King is regal
# (crown, formal robe), the Old-Timer is a cabin regular — trapper hat with fur flaps, a red
# flannel shirt and suspenders, a big gray mustache. Bust only (head + shoulders), since it
# sits beside a seat label rather than filling a card, so it gets its own canvas size and none
# of the corner-index layout constraints face cards have.

FLANNEL_RED = (158, 56, 42, 255)  # barn-red, warmed from the original brownish-red
HAT_FUR = (232, 216, 184, 255)    # warmer cream, homestead sheepskin rather than grey fur

# --- Avatar-only tones. Each of these is the ONLY user of its slot inside the one sprite it
# appears in — a coat colour, a hair colour, a hat colour — so it SWAPS a base tone rather than
# adding one, and costs nothing against `_assert_sprite_colours`. Picking the right colour and
# picking a colour already elsewhere in the file are therefore the same price; these are chosen
# for the character, not for the palette table.
# Black hair, biased FAR cooler than it looks, because it is pre-compensated for the room's
# light. `light_from` lifts the hearth-facing side with a strongly WARM, largely ADDITIVE ramp:
# from the old (36,33,40) the lit half landed at (75,63,53), a solid brown block across half her
# head, so the character described as black-haired read brown on the lit side and black on the
# shaded one. Darkening the base does not help — measured, (16,15,22) still lit to (59,48,37) —
# because the warmth is added, not scaled.
#
# The fix is to pre-compensate the base for that transform. But there is no base that makes BOTH
# halves neutral — the lift is large, so any value cool enough to neutralise the lit side leaves
# the shaded side navy, which is what a first attempt at (24,28,48) did: lit went neutral and
# the shaded half turned blue. Swapping one two-tone problem for another.
#
# So it is a minimax, solved by sweeping the candidates and measuring both halves. (26,23,38)
# gives +15 on the lit side and -14 on the shaded, worst swing 15, against 22 for the old
# (36,33,40) and 26 for the over-corrected blue. Darker overall too, which helps it read black
# at all. What is left is a warm highlight on dark hair, which is what firelight actually does.
# She is the only user of this constant, so nobody else's sprite moves.
HAIR_BLACK = (26, 23, 38, 255)
# Her jumper: a deep warm forest green, hand-knit like the Kid's. Warm on purpose — a forest
# green pushed cool goes olive-grey and reads like outerwear, and this is meant to be the
# comfortable thing you wear indoors by a fire in winter.
#
# Checked against the Kid rather than picked in isolation, because they are the two knits in
# the cast and a four-character lineup cannot carry the same garment twice: KNIT_TEAL is H171,
# unmistakably blue-green, and this is H108. Sixty-odd degrees apart, at the same lightness, so
# they separate at a glance without either having to be brighter than the room.
KNIT_FOREST = (68, 98, 60, 255)
# Jade, for her pendant. Milky and desaturated rather than a clean green — jade reads as stone
# because it is cloudy, and a saturated green here would just be a bead. Lighter than her
# jumper by a clear step so the two greens do not merge into one when it sits against them.
JADE = (126, 178, 140, 255)
# Olive, from the reference: a khaki green with real yellow in it, not the deep blue-leaning
# forest her jumper was. It has to sit apart from BOTH the Kid's KNIT_TEAL (H171, blue-green)
# and the Old-Timer's hat; olive lands near H67, which is its own corner of the wheel.
OLIVE = (104, 108, 68, 255)
# The beading. A warm pale gold, one step off the cloth rather than a bright spark: sequins at
# this size are catchlights on a surface, and full-brightness dots read as snow on the garment.
BEAD = (206, 196, 150, 255)
                                  # BOOT_DARK brown it replaced — and so a sheen mixed off it
                                  # lands on slate rather than mud.
HAIR_BLOND = (228, 190, 112, 255)  # straw, not GOLD: GOLD is the tin star and the spectacles,
                                   # and hair that matches jewellery reads as metal.
KNIT_TEAL = (74, 116, 110, 255)   # hand-knit wool. Deliberately not LEAF_GREEN or CAP_GREEN —
                                  # the Old-Timer's hat is CAP_GREEN and the two would rhyme.
TWEED = (120, 98, 72, 255)        # flat-cap wool, a full step lighter than WOOD_MED so the cap
                                  # separates from the hair under it.
WORK_DENIM = (78, 96, 118, 255)   # his shirt. Was CLOTH_BLUE, which at (96,104,108) is a mid
                                  # NEUTRAL grey — beside the card sharp's STEEL the two bodies
                                  # read as the same pale-cool garment at a glance, which is the
                                  # exact failure this cast was rebuilt to fix. Denim is darker
                                  # and actually blue, so the two separate on both axes.

# Flat FLANNEL_RED on both the chest AND the crown, plus cream fur trim and a grey moustache,
# is Santa's exact colour signature (red coat + white fur trim + white beard) — reported
# directly as "looks like Santa". The silhouette (trapper flaps, moustache not a full beard)
# was never the problem, so it stays; only the colour story changes. `_buffalo_check()` breaks
# the chest up into a red/dark-brown check instead of a flat mass, and the crown moves off red
# entirely onto CAP_GREEN (the Jack's homespun cap colour — already in the palette, already
# "not suit-colored") so hat and coat are no longer both red.

# `_old_timer_parts()` / `draw_old_timer_face()` / `make_old_timer_portrait()` used to live
# here: a standalone head-and-shoulders portrait, shown in a corner of the scoreboard for
# reaction close-ups (the original Phase 2 design spec, §8). Deleted in 2h.1 — dead code found
# during that phase's audit, still writing `public/art/portraits/old_timer_{idle,happy,
# rueful}.png` and still counted in the `main()` run summary, with `src/` referencing none of
# it. Superseded when 2f.3 put the Old-Timer at the table (`make_opponent()` below, reusing
# this same geometry at a different scale) and made obsolete for the reason
# `Scoreboard.tsx` states directly: once he sits across the table reacting with the same
# `useOpponentExpression` states, a second portrait of the same man in the corner is
# "literally a second copy of the same man on the same screen" — removed there in 2e.7, three
# phases before its generator stopped being called here.


# --- The opponent, across the table (Phase 2f.3) ------------------------------------------ #
# Replaces `make_seated_old_timer()`, which drew a whole tiny person parked in the RIGHT
# MARGIN of the room while his two card fans sat at the top of the table. Measured at
# 1400x900: his body rendered 538px right of and 226px below his own cards. Nobody would
# design that — it is what happens when the seating is changed (2e.4 moved his hands to the
# north edge) and the sprite that depended on it is not re-checked.
#
# **On scale.** Physical scale, taking the card as ruler (89mm / 70au => 1au ~ 1.27mm), would
# make a head 181au — 2.6 card-heights — and shoulders 354au. That is photographically right
# and stylistically wrong: no pixel card game frames a person that way, and at --px 2 the head
# alone would eat 40% of a 900px viewport. So this is a DELIBERATE stylised ratio, stated here
# so the next person does not have to reverse-engineer it: **head ~= one card-height.** That
# reads unmistakably as a person sitting across from you while leaving the table its space.
# The previous figure's real failing was not that it disagreed with physics; it was that it
# was tiny, in the wrong place, and severed from its own hands.
#
# Drawn head-and-shoulders only. He is composited BEHIND the felt and behind his own card
# fans, so his chest and arms are occluded by the table exactly as they would be if you were
# sitting opposite him — which also means the sprite never has to solve for the space it
# doesn't have.

OPP_W, OPP_H = 300, 280          # file px; halved to 150x140 au by save_asset()
OPP_CX = OPP_W // 2
OPP_HEAD_CY = 92
OPP_HEAD_RX, OPP_HEAD_RY = 62, 66


def _star_points(cx, cy, r_out, r_in, points=5):
    """A 5-point star polygon, point-up. Used for the chest pin below — `_poly` takes any
    point list, but nothing else in this file needed a star, so there was no existing helper
    to reuse."""
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        angle = math.radians(-90 + i * (360 / (points * 2)))
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


# --- Playable avatars (4 characters) --------------------------------------------------- #
# Online, both players were drawn as the Old-Timer: your opponent wore the face of a character
# neither of you is. These four are what you pick between, and you only ever see your
# OPPONENT's — you are the hands at the bottom of the screen, not a portrait.
#
# They are distinguished SILHOUETTE FIRST, because that is what reads at 150x140 au across a
# table: an earflapped trapper hat, a tied kerchief, a brimmed bowler, a bobbled beanie. Colour
# and facial hair reinforce it, they don't carry it on their own. Every tone below is already in
# this file's palette — a new base tone costs a final colour in each `light_from` band it lands
# in, and `_assert_sprite_colours` caps a sprite at SPRITE_COLOUR_CEILING (the Old-Timer sits at
# 52 of 64), so inventing colours per character is the fast way to blow that budget.
class Avatar:
    """One playable character. Everything that differs between the four lives here, so the
    drawing code below stays a single pass with no per-character special cases scattered
    through it."""

    def __init__(self, key, coat, placket, headwear, headwear_main, headwear_trim,
                 facial="none", facial_colour=BEARD_GRAY, hair=None, hair_style="none",
                 chest="none", glasses=False, pipe=False, age_lines=False, check=False,
                 soft_features=False, skin=SKIN,
                 # --- build: what actually stops four characters being one character ---------
                 head_rx=62, head_ry=66, head_dy=0, neck_w=26, shoulder_x=96, shoulder_in=62,
                 hem_x=112, arm_x=118,
                 # --- posture: how this person SITS -----------------------------------------
                 lean=0, shoulder_dy=(0, 0), head_dx=0, hand_x=66, hand_dy=(0, 0),
                 # --- face proportion --------------------------------------------------------
                 eye_dx=24, eye_w=8, eye_up=12, eye_dn=8, brow_dy=0, nose_w=4, nose_dy=0,
                 mouth_w=20, brow_colour=None, brow_h=8, accent=None, shadow_desat=0.0,
                 lid="creased", brow_span=(20, -12),
                 smirk=False,
                 extras=()):
        self.key = key
        self.coat = coat                    # shoulders/chest
        self.placket = placket              # centre panel, so the chest isn't one flat mass
        self.headwear = headwear            # 'trapper' | 'kerchief' | 'bowler' | 'beanie'
        self.headwear_main = headwear_main
        self.headwear_trim = headwear_trim
        self.facial = facial                # 'moustache' | 'beard' | 'thin' | 'none'
        self.facial_colour = facial_colour
        self.hair = hair                    # visible hair colour, or None if the hat covers it
        self.hair_style = hair_style        # 'braid' | 'bob' | 'sideburns' | 'none'
        self.chest = chest                  # 'star' | 'chain' | 'none'
        self.glasses = glasses
        self.pipe = pipe
        self.age_lines = age_lines          # crow's feet: the Old-Timer's whole point
        self.check = check                  # buffalo-check the coat
        # Lighter brow ridge and no heavy jaw block. The face modelling was authored for a
        # character called the Old-Timer — a deep brow and a hard jaw shadow are most of what
        # makes it read as an older man — so the women in the set soften both. Signalled this
        # way, plus hair and no facial hair, rather than with lashes, lipstick or bows: those
        # are cliches, and at 150x140 au with a 4px grid they are also illegible mush.
        self.soft_features = soft_features
        self.skin = skin
        # A hat and a coat colour are a costume. What makes someone a different PERSON at this
        # size is the shape under the costume: how wide the shoulders are, how long the neck is,
        # how big and how round the head is, how far apart the eyes sit. The first pass at this
        # cast shared one head ellipse, one shoulder polygon, one eye spacing and one skin tone
        # between all four, and read exactly like what it was — one man in four hats.
        self.head_rx = head_rx
        self.head_ry = head_ry
        self.head_dy = head_dy          # +down. Longer neck = head sits higher.
        self.neck_w = neck_w
        self.shoulder_x = shoulder_x    # outer shoulder point
        self.shoulder_in = shoulder_in  # where the shoulder line meets the neck
        self.hem_x = hem_x              # width at the crop line
        self.arm_x = arm_x
        # A build is still a mannequin. POSTURE is what makes it a person, and until round 5
        # every one of these four sat in the identical square, level-shouldered, both-hands-
        # forward pose — four faces on one body, which is the same failure as one man in four
        # hats moved twelve pixels up the sprite. These five knobs are the whole of it, and
        # they are all IDENTITIES at their defaults, which is what keeps the Old-Timer
        # byte-identical while the other three stop being him.
        #
        # `lean` moves the BODY anchor only; the head stays where `head_dy` put it. That is
        # deliberate, and it is why leaning is free: the face — four rounds of work — never
        # moves a pixel, and the neck simply lengthens or swallows itself. Shoulders down away
        # from a high head is someone sitting up; shoulders up around a low head is someone
        # hunched over the table. Both come out of one number.
        self.lean = lean
        # Per-side extra drop on the OUTER shoulder point, (left, right), + = dropped. This
        # is the one change that survives the silhouette test: at this crop the arms and hands
        # are entirely inside the body outline, so the shoulder LINE is the only body edge the
        # viewer can actually see. Keep both multiples of 8 — the inner point takes half, and
        # everything here has to land on the 4px grid.
        self.shoulder_dy = shoulder_dy
        # Head centre off the body's centre line. Small numbers: +-8 file px is +-4 at native
        # size and already reads as a head that is not squarely on its own shoulders.
        self.head_dx = head_dx
        # Where the hands sit, and how high. `hand_x` is the distance from centre to the hand
        # (the forearm's inner edge follows it, or the hands read as buttons stuck on the
        # chest — the exact failure noted on the sleeves below); `hand_dy` is per-side, so one
        # hand can sit lower than the other. Sleeve garters and the ring track both, since
        # they are drawn ON these shapes.
        self.hand_x = hand_x
        self.hand_dy = hand_dy
        self.eye_dx = eye_dx
        self.eye_w = eye_w
        self.eye_up = eye_up
        self.eye_dn = eye_dn
        self.brow_dy = brow_dy
        self.nose_w = nose_w
        self.nose_dy = nose_dy
        self.mouth_w = mouth_w
        # 'creased' carves a shadow pad above the eye; 'low' leaves the upper lid smooth and
        # full. The accurate way to draw an eye with a low or absent upper-lid crease is to
        # REMOVE that pad, not to add anything — and never by tilting the eye, which is the
        # caricature and reads as one instantly at this size.
        self.lid = lid
        # Outer and inner reach of the brow, measured from `eye_dx`. The default (20,-12) is a
        # 32px bar, authored on the Old-Timer and fine under his spectacles. On a bare wider
        # face it is a long severe stroke that dominates everything else.
        self.brow_span = brow_span
        # Brows default to the hair colour, which is right for everyone whose hair is darker
        # than their face. It is wrong for the blonde child: a straw brow on a fair forehead is
        # invisible at 8px, and the brow is where three of the four expressions actually happen,
        # so she would have had one expression and three variations of it.
        self.brow_colour = brow_colour
        # Brow WEIGHT. 8px is a man's brow and it was the only one on offer; at 4px the same
        # line reads as a woman's. Half the merge note about the Card Sharp reading
        # androgynous was this one number.
        self.brow_h = brow_h
        # One saturated colour per character for lips / ribbons / ties. Kept as a single
        # knob because these are the marks that must NOT be sampled from the skin ramp —
        # they only work by being the one thing on the sprite that is not skin or cloth.
        self.accent = accent
        # Her happy is not everyone's happy. The four expressions were one construction shared
        # by all four characters, which is the same disease as one posture shared by all four
        # bodies: the Card Sharp squeezing her eyes shut in a big open grin is a tell, and a
        # tell is the one thing she does not have. With `smirk` her happy keeps the eyes OPEN
        # and lifts one corner of the mouth — amused, and you cannot price it.
        self.smirk = smirk
        # How far this character's skin SHADOWS are pulled back toward neutral before they
        # are drawn. 0.0 is `ramp()` raw, which is what the Old-Timer shipped with and what
        # keeps him byte-identical; everyone else needs some, and the warmer the base tone
        # the more (see `_desat`).
        self.shadow_desat = shadow_desat
        self.extras = extras            # per-character detail passes, by name


AVATARS = {
    # The original, unchanged in every particular — his sprite is byte-identical to the one
    # this refactor replaced, which is asserted by regenerating and pixel-diffing against HEAD.
    "old_timer": Avatar(
        "old_timer", FLANNEL_RED, BOOT_DARK, "trapper", CAP_GREEN, HAT_FUR,
        facial="moustache", facial_colour=BEARD_GRAY, chest="star",
        glasses=True, pipe=True, age_lines=True, check=True,
        extras=("brow_ridge",),
    ),
    # --- The Card Sharp ------------------------------------------------------------------
    # The one character with no headwear at all: BLACK hair down past the jaw IS her
    # silhouette, which is what separates her from a hatted head at a glance.
    #
    # The coat is pale wool for a load-bearing reason, not a mood. A first pass gave her a
    # BOOT_DARK coat and BOOT_DARK hair, and the two merged into a single dark mass the moment
    # the hair reached the shoulder line — the hair simply vanished. Dark hair needs a light
    # garment behind it, so STEEL carries the shoulders and the hair reads against it. Black
    # hair makes that need worse, not better, so STEEL stays.
    #
    # Build: the smallest head, the narrowest shoulders and the longest neck in the set
    # (head_dy -8 lifts it off the collar), which is what reads as poise from across a table.
    # head_rx went 54 -> 56 for one reason: her hair falls inward from hx(52), so at rx 54 the
    # visible face was ~40px wide and every feature had to fight the hair for it.
    # Detail: sleeve garters, a throat brooch on a high collar, a gold drop earring on the lit
    # side, a ring, and a sheen across the crown — glossy black hair is the whole point of her,
    # and flat black at this size is a hole in the sprite rather than hair.
    "card_sharp": Avatar(
        "card_sharp", OLIVE, OLIVE, "none", OLIVE, OLIVE,
        facial="none", hair=HAIR_BLACK, hair_style="bob", chest="none",
        soft_features=True, skin=SKIN_GOLDEN, lid="low",
        # 60x58, not 56x64. She was the only long oval in the cast and it read as exactly that
        # — a long face. Rounder, and slightly wider than the head she had, which also gives
        # her features room they did not have at rx 56. Still taller than wide, so she does not
        # drift toward the Kid's head-wider-than-tall child proportion; the shoulder width
        # (84 against the Kid's 74) keeps them apart regardless.
        # Slimmer than she was: with bare arms the sides of the sprite ARE her, not cloth, so
        # the widths that read as a coat read as build. Shoulders and hem come in, and the arm's
        # outer edge with them.
        head_rx=60, head_ry=58, head_dy=-8, neck_w=20, shoulder_x=78, shoulder_in=50,
        hem_x=92, arm_x=96,
        # nose_dy 16, not 0: the base was at hy+2 against a chin at hy+58, i.e. the nose sat in
        # the upper third of the face. 16 puts the base at hy+18, roughly halfway from eyes to
        # chin, which is where a nose goes. Back to nose_w 3 — at 4 the nostrils sit at +-12 and
        # the tip shadow runs -8..+12, and the whole thing read wide and flat once it came down
        # onto the fuller part of the face.
        eye_dx=26, eye_w=8, eye_up=10, eye_dn=6, brow_dy=-2, nose_w=3, nose_dy=16, mouth_w=16,
        brow_h=6, brow_span=(12, -10), accent=ROSE_RED, shadow_desat=0.30, smirk=True,
        lean=4, hand_x=48,
        extras=("cheekbone", "soft_nose", "philtrum", "lashes", "lips", "beauty_mark",
                "sheen", "earring", "ring", "low_bridge", "fringe", "tank", "beading", "jade_pendant",
                "soft_lips"),
    ),
    # --- The Kid -------------------------------------------------------------------------
    # A child is not a small adult, and the difference is entirely proportion, so this is the
    # build doing nearly all the work:
    #   * head WIDER than it is tall (rx 58 > ry 56) and the biggest in the set relative to the
    #     body — the single most reliable "young" cue there is;
    #   * head_dy +10, so she sits LOW: the top of her skull is 20px below the Old-Timer's and
    #     she reads as short, not just as a different face;
    #   * shoulder_x 74 and neck_w 16 — the narrowest shoulders and thinnest neck here, which
    #     is what makes the head read big rather than the head read normal;
    #   * brow_dy +8 pushes the whole feature cluster BELOW the head's midline, leaving the tall
    #     forehead every child has, and eye_w 10 / eye_up 14 give her the largest eyes.
    # Detail: a hand-cut fringe (uneven on purpose — the two halves stop at different heights),
    # two side bunches tied with red ribbon, freckles, a cream collar with two buttons, and a
    # gap in her front teeth that only shows when she grins.
    "kid": Avatar(
        "kid", KNIT_TEAL, PARCHMENT, "none", KNIT_TEAL, KNIT_TEAL,
        facial="none", hair=HAIR_BLOND, hair_style="plaits", chest="none",
        soft_features=True, skin=SKIN_FAIR,
        head_rx=58, head_ry=56, head_dy=10, neck_w=16, shoulder_x=74, shoulder_in=46,
        hem_x=90, arm_x=96,
        lean=-12, shoulder_dy=(-8, 8), head_dx=12, hand_x=40, hand_dy=(-12, -4),
        # Eye 15px tall, not 20. Big eyes are the child cue and she should keep the biggest in
        # the cast relative to her head — but 20px of solid INK on the SMALLEST head (head_ry
        # 56, so 28 half-rows) put a third of her face inside two black slabs, and that is not a
        # child, it is a doll. Measured off the sprite: ink from row 44 to row 53 unbroken.
        # Reduced from the top mostly, so the lower lid keeps sitting where the cheek expects it.
        #
        # Brow 6px, not 4: at 4 it is one grid unit, and one unit of dark-blonde on pale skin
        # directly beneath a blonde hairline does not separate from it.
        eye_dx=22, eye_w=9, eye_up=9, eye_dn=6, brow_dy=8, nose_w=4, nose_dy=8, mouth_w=14,
        brow_colour=_mix(HAIR_BLOND, HAIR_BROWN, 0.75), brow_h=6, accent=ROSE_RED,
        shadow_desat=0.40,
        extras=("nostrils", "blush", "freckles", "knit", "ribbons", "buttons", "gap_tooth"),
    ),
    # --- The Regular ---------------------------------------------------------------------
    # "Average" is a trap: the previous cast failed review precisely because everyone was drawn
    # off the default, so the one character whose brief is "ordinary" is the one at most risk of
    # being the default with a coat on. He is therefore ordinary in COSTUME (a flat cap, a work
    # shirt, braces, three days of stubble — nothing exotic, nothing narrative) and specific in
    # BUILD: the longest face in the set (ry 70 against rx 60, the only head clearly taller than
    # it is wide), the thickest neck (32), sloping heavy shoulders, a wide nose and a wide mouth.
    # He is a big soft-faced bloke, and that is a person, not a placeholder.
    #
    # The flat cap is the one asymmetric shape in the cast: its peak juts past the head on the
    # lit side only, so his silhouette is the only one that is not mirror-symmetric.
    "regular": Avatar(
        "regular", WORK_DENIM, ramp(WORK_DENIM)[3], "flatcap", TWEED, WOOD_MED,
        facial="none", hair=HAIR_BROWN, hair_style="sideburns", chest="none",
        skin=SKIN_WARM,
        head_rx=60, head_ry=70, head_dy=2, neck_w=32, shoulder_x=104, shoulder_in=68,
        hem_x=118, arm_x=124,
        eye_dx=25, eye_w=8, eye_up=11, eye_dn=8, brow_dy=0, nose_w=4, nose_dy=2, mouth_w=20,
        shadow_desat=0.40,
        lean=4, shoulder_dy=(16, 0), head_dx=-8, hand_dy=(12, -12),
        extras=("cheekbone", "nostrils", "bridge", "laugh_lines", "cleft", "philtrum", "ears",
                "stubble", "collar", "braces", "pocket", "ring"),
    ),
}

DEFAULT_AVATAR = "old_timer"


def _sleeve_tone(av):
    """The sleeve has to be a step darker than anything the torso puts behind it.

    Unless there is no sleeve. Bare arms take HALF a step down from her own skin: flat base
    tone gives the arm no edge against the bare shoulder above it and the two merge, while the
    full `ramp` shadow is dark enough on skin to read as a tan line rather than as form."""
    if "tank" in av.extras:
        return _mix(av.skin, ramp(av.skin)[2], 0.5)
    return ramp(av.coat)[3] if "knit" in av.extras else ramp(av.coat)[2]


def _avatar_parts(av):
    """Head, hat and shoulders at across-the-table size — same flannel, same trapper hat, same
    moustache the standalone portrait used to draw (deleted in 2h.1; see the note above),
    deliberately redrawn at this size rather than scaled up from a smaller original, because
    scaling pixel art is the one thing this project forbids.

    Now takes an `Avatar`. The Old-Timer's branch emits exactly the parts, in exactly the order,
    that this function emitted before it was parameterised — order matters because
    `composite_sprite` paints in sequence and every part shadows the ones under it, so a
    reordering would change his sprite even with identical shapes."""
    # `sy` is the BODY anchor and `hy` is the HEAD centre; the difference between them is the
    # neck, and it is most of why a character reads as tall and poised or short and hunched.
    # `sy` used to be fixed at OPP_HEAD_CY on the reasoning that everyone sits at the same
    # table — true of the table, false of the people. `av.lean` moves it now (round 5): the
    # head still sits exactly where `head_dy` puts it, so no face moves, but the body under it
    # rises toward the table or settles away from it.
    sy = OPP_HEAD_CY + av.lean
    hy = OPP_HEAD_CY + av.head_dy
    # Head centre line, which is no longer the body's. `cx` is used by everything from the
    # neck up; OPP_CX stays the body's own centre.
    cx = OPP_CX + av.head_dx
    # Shoulder tilt. The outer point takes the full drop and the inner point (at the neck)
    # takes half, because a shoulder line pivots about the neck rather than sliding down whole.
    sdl, sdr = av.shoulder_dy
    # The forearm's inner edge tracks the hand, so a hand brought in toward the centre arrives
    # attached to an arm instead of resting on the chest like a button.
    arm_in = av.hand_x - 8
    hdl, hdr = av.hand_dy

    def hx(v):
        """Horizontal distance scaled to this head's width."""
        return round(v * av.head_rx / 62)

    def vy(v):
        """Vertical distance scaled to this head's height."""
        return round(v * av.head_ry / 66)

    torso = _poly([
        (OPP_CX - av.shoulder_x, sy + 74 + sdl), (OPP_CX - av.shoulder_in, sy + 52 + sdl // 2),
        (OPP_CX + av.shoulder_in, sy + 52 + sdr // 2), (OPP_CX + av.shoulder_x, sy + 74 + sdr),
        (OPP_CX + av.hem_x, OPP_H), (OPP_CX - av.hem_x, OPP_H),
    ])
    if "tank" in av.extras:
        # Garment underneath, bare YOKE laid over it. The reverse — whole torso in skin, tank
        # on top — leaves the sides bare to the hem, because a tank's arms are skin too, so
        # torso and arms merge into one undifferentiated mass. Skin only where skin shows.
        parts = [
            (torso, av.coat),
            (_poly([
                (OPP_CX - av.shoulder_x, sy + 74 + sdl),
                (OPP_CX - av.shoulder_in, sy + 52 + sdl // 2),
                (OPP_CX + av.shoulder_in, sy + 52 + sdr // 2),
                (OPP_CX + av.shoulder_x, sy + 74 + sdr),
                # A V, not a scoop. The reference neckline comes to a point; a round scoop and
                # a V read as different garments even at eight pixels, and the V is most of
                # what makes this a camisole rather than a vest.
                # The V comes to sy+86, not sy+100. At 100 it cut most of the way down the
                # chest and the tank read as far more revealing than the reference, which has a
                # neckline, not a plunge. The outer corners also come in to +-62 so the bodice
                # carries more of the torso and the bare sides are arm rather than ribcage.
                (OPP_CX + 62, sy + 84), (OPP_CX + 30, sy + 72), (OPP_CX, sy + 86),
                (OPP_CX - 30, sy + 72), (OPP_CX - 62, sy + 84),
            ]), av.skin),
            # Straps: narrow, and set well in toward the neck like the reference's, not out on
            # the shoulder point where a vest's would sit.
            (_poly([
                (OPP_CX - 44, sy + 52), (OPP_CX - 32, sy + 52),
                (OPP_CX - 30, sy + 86), (OPP_CX - 42, sy + 86),
            ]), av.coat),
            (_poly([
                (OPP_CX + 32, sy + 52), (OPP_CX + 44, sy + 52),
                (OPP_CX + 42, sy + 86), (OPP_CX + 30, sy + 86),
            ]), av.coat),
        ]
    else:
        parts = [
            (torso, av.coat),
            # A darker placket so the chest is not one flat red mass at this size.
            (_poly([
                (OPP_CX - 12, sy + 56), (OPP_CX + 12, sy + 56),
                (OPP_CX + 16, OPP_H), (OPP_CX - 16, OPP_H),
            ]), av.placket),
        ]
    parts += [
        # A small tin star pinned to the chest (creative-direction pass). Sits left of the
        # placket (clear by 18+ file px / 9+ au) and well clear of both arm/hand shapes, which
        # start no closer than x=OPP_CX-44 at any y — this star's x=OPP_CX-34 never reaches
        # them, at any y, so no need to also dodge them vertically. Kept above hy+90 anyway,
        # in the plainest, flattest run of chest fill, the spot the direction review flagged
        # as free: below the shoulder line (hy+52) and clear of the placket and hand zone.
    ]
    if av.chest == "star":
        parts.append((_poly(_star_points(OPP_CX - 34, sy + 70, 12, 5)), GOLD))
    elif av.chest == "chain":
        # A watch chain: two short links swagged across the waistcoat, not a drawn curve —
        # a 1px arc would vanish at this size and under the 4px snap grid.
        parts.append((_poly([
            (OPP_CX - 40, sy + 62), (OPP_CX - 8, sy + 74),
            (OPP_CX - 8, sy + 80), (OPP_CX - 40, sy + 68),
        ]), GOLD))
    parts += [
        # Forearms and hands, resting on the table (2g.5). He was a floating BUST: shoulders
        # that simply stopped, no arms, no hands, no contact with the furniture in front of
        # him. Every other object in this room got grounded during Phase 2f and 2g — the table
        # got legs and a contact shadow, the cat got a shadow, the rug got the table standing
        # on it — while the one PERSON hovered. These come in from the lower corners and angle
        # toward where his two card fans actually sit, so he reads as holding them.
        # Sleeves get a DARKER flannel than the chest. Drawn in the same FLANNEL_RED they were
        # invisible against the body behind them, so all that showed were two skin ovals
        # floating on his chest, reading unmistakably as buttons. An arm needs an edge.
        #
        # ROUND 5, from Designer B: on a KNIT coat that edge was gone again. `_buffalo_check`
        # recolours half the torso to `ramp(coat)[2]` — the exact tone the sleeve is drawn in —
        # so the Kid's arms dissolved into her own jumper. Measured on the shipped sprite:
        # sleeve (78,100,77), torso knit blocks (78,100,77). It went unnoticed for four rounds
        # because both arms sat symmetrically in the default place; moving them is what exposed
        # it. Knit coats therefore take the next step down the ramp, which the check pattern
        # does not use.
        (_poly([
            (OPP_CX - av.arm_x, OPP_H), (OPP_CX - (av.shoulder_x - 2), sy + 74 + sdl),
            (OPP_CX - arm_in, sy + 94 + hdl), (OPP_CX - arm_in - 4, OPP_H),
        ]), _sleeve_tone(av)),
        (_poly([
            (OPP_CX + av.arm_x, OPP_H), (OPP_CX + (av.shoulder_x - 2), sy + 74 + sdr),
            (OPP_CX + arm_in, sy + 94 + hdr), (OPP_CX + arm_in + 4, OPP_H),
        ]), _sleeve_tone(av)),
        # Mended patch on the right sleeve (wave-3 polish). Sits inside the right sleeve quad
        # above — verified against its actual edges at this y-range: the sleeve's inner edge
        # runs (OPP_CX+58, hy+94) to (OPP_CX+62, OPP_H) and its outer edge runs (OPP_CX+94,
        # hy+74) to (OPP_CX+118, OPP_H), so at hy+130..hy+156 the sleeve spans roughly
        # OPP_CX+59..OPP_CX+112 — this patch (OPP_CX+64..+88) sits well inside that, with margin
        # on both sides. Also well below the hand polygon (which tops out at hy+84, ends by
        # hy+118) and well above the hem crop at OPP_H. CAP_GREEN reused from the hat — mended
        # by someone, not matching. A single flat part like every other shape in this list, so
        # it gets the same automatic darken()-edge band `composite_sprite` already gives every
        # part — that IS the stitched-edge line, no separate border rectangle needed.
        #
        # x-position matters here beyond clearance: `light_from` relights this whole sprite in
        # 5 discrete vertical bands (LIGHT_BANDS), and the sprite's colour budget (asserted by
        # `_assert_sprite_colours`) was already sitting at its ceiling before this change — every
        # base tone in a NEW band is a new final colour, not a reused one. The hat (this sprite's
        # only other CAP_GREEN user) spans OPP_CX-58..+58, i.e. x 92..208 at OPP_W=300 — bands 1
        # through 3 of 5 (band width 60). This patch is kept inside x 214..238, i.e. band 3 only
        # (180..239), so its CAP_GREEN reuses a band already in the sprite instead of adding one.
        # (An earlier draft at OPP_CX+70..+94, plus a separate darken(CAP_GREEN) border
        # rectangle, spilled into band 4 and blew the budget — confirmed by regenerating and
        # diffing `_assert_sprite_colours`' colour count against the pre-change baseline.)
    ]
    if av.key == "old_timer":
        parts.append((_poly([
            (OPP_CX + 64, sy + 130), (OPP_CX + 88, sy + 130),
            (OPP_CX + 88, sy + 156), (OPP_CX + 64, sy + 156),
        ]), CAP_GREEN))
    parts += [
        # Hands: squared-off, not round. A circle of skin reads as a ball; knuckles and a
        # thumb read as a hand even at eight pixels across.
        # The same five points on each side, but positioned off `hand_x` and `hand_dy` rather
        # than nailed to +-66: at av.hand_x 66 and hand_dy (0, 0) these are the exact literals
        # they replaced, which is what the Old-Timer's byte-identity check is measuring.
        (_poly([
            (OPP_CX - av.hand_x - 22, sy + 92 + hdl), (OPP_CX - av.hand_x + 14, sy + 84 + hdl),
            (OPP_CX - av.hand_x + 22, sy + 100 + hdl), (OPP_CX - av.hand_x + 14, sy + 118 + hdl),
            (OPP_CX - av.hand_x - 18, sy + 116 + hdl),
        ]), av.skin),
        (_poly([
            (OPP_CX + av.hand_x + 22, sy + 92 + hdr), (OPP_CX + av.hand_x - 14, sy + 84 + hdr),
            (OPP_CX + av.hand_x - 22, sy + 100 + hdr), (OPP_CX + av.hand_x - 14, sy + 118 + hdr),
            (OPP_CX + av.hand_x + 18, sy + 116 + hdr),
        ]), av.skin),
        # Neck, behind the head so the jaw reads as sitting on it. Top edge on the HEAD's
        # centre line and bottom edge on the BODY's, so a head carried off centre gets a neck
        # that leans with it instead of a vertical post the skull has slid sideways off.
        (_poly([
            (cx - av.neck_w, hy + 34), (cx + av.neck_w, hy + 34),
            (OPP_CX + av.neck_w + 4, sy + 60), (OPP_CX - av.neck_w - 4, sy + 60),
        ]), av.skin),
    ]

    # --- BEHIND the head -------------------------------------------------------------------
    # Long hair and plaits get a halo ellipse painted before the skull, so what survives is a
    # RIM of hair around the face plus whatever hangs past it. That rim is where hair volume
    # comes from; hair drawn only in front of the head is a wig sitting on a ball. (The
    # Old-Timer has neither hair nor ears here, so this block emits nothing for him and his
    # part order is exactly what it was.)
    if av.hair is not None and av.hair_style in ("long", "plaits"):
        # A bob gets only a thin halo: the rim behind the skull is what gives LOOSE hair its
        # volume, and too much of it under a blunt cut just makes the cut look untidy.
        halo = 14 if av.hair_style == "long" else (10 if av.hair_style == "bob" else 10)
        # The bottom of the halo runs to the SHOULDER (it carries `av.lean`), not to a fixed
        # offset under the jaw. Under the plaits it is the only thing spanning the gap between
        # the cheek and the first plait segment, and once the Kid's shoulders came up around a
        # low head that gap stopped being covered from below — the flat-black render showed a
        # notch punched clean through the silhouette beside her ear. It is behind the skull, so
        # lengthening it is free everywhere it is not needed.
        # Plaits only: the halo runs past the jaw to the shoulder line (and carries
        # `av.lean`) because under a plait it is the only thing spanning cheek-to-plait, and
        # the head is painted over it anyway. Long hair keeps the original stop — extended, it
        # filled the throat behind the neck and turned her hair into a hood.
        halo_low = (vy(16) + av.lean) if av.hair_style == "plaits" else -vy(4)
        parts.append((_ellipse(cx - av.head_rx - halo, hy - av.head_ry - vy(12),
                               cx + av.head_rx + halo,
                               hy + av.head_ry + halo_low), av.hair))
    if "ears" in av.extras:
        # Jug ears, drawn before the skull so only the part that sticks out past it shows. The
        # plainest possible specific, which is this character's whole brief — and pushed out
        # far enough to actually break the silhouette, because an ear tucked inside the head
        # outline is an ear nobody can see.
        for side in (-1, 1):
            ex_ = cx + side * (av.head_rx - 2)
            parts.append((_ellipse(ex_ - 14, hy - vy(4), ex_ + 14, hy + vy(28)), av.skin))
    parts.append((_ellipse(cx - av.head_rx, hy - av.head_ry,
                           cx + av.head_rx, hy + av.head_ry), av.skin))

    # --- IN FRONT of the head --------------------------------------------------------------
    # Hair, under the headwear so the hat edge always wins where they meet.
    if av.hair is not None:
        if av.hair_style == "braid":
            # Hair FRAMES the face and a braid hangs past it onto the shoulder. The first pass
            # ran the braid from x-54 to x-26 down to hy+62 — straight across the cheek and
            # jaw, which at this size read as a beard, not hair. The head ellipse spans
            # OPP_CX+-62, so anything meant to sit beside the face has to stay outside roughly
            # +-44 and anything meant to hang free has to clear hy+66 (the chin) entirely.
            for side in (-1, 1):
                x0, x1 = sorted((cx + side * 46, cx + side * 66))
                parts.append((_poly([
                    (x0, hy - 26), (x1, hy - 26), (x1, hy + 26), (x0, hy + 30),
                ]), av.hair))
            # The braid itself, on the near shoulder and clear of the jaw.
            parts.append((_poly([
                (cx - 78, hy + 18), (cx - 54, hy + 22),
                (cx - 50, hy + 78), (cx - 72, hy + 74),
            ]), av.hair))
        elif av.hair_style == "long":
            # ROUND 2 MERGE, from Designer A. Mine was a flat "skull cap" — a plateau with a
            # sheen on it and no hairline, which the review called out and which was my own
            # stated regret. A's construction is better and this is theirs, re-fitted to my
            # head numbers:
            #
            #   * volume comes from the HALO ellipse behind the skull (above), not from the
            #     front piece. That rim is what makes hair look like it has a head inside it.
            #   * the front piece is ONE swept shape, not two mirrored wings meeting at a
            #     centre seam. A tried mirrored halves first and got a skin-coloured wedge at
            #     the crown where the two polygons failed to meet — at this size that wedge
            #     does not read as a parting, it reads as bare scalp. A single piece cannot
            #     have a seam. The part is implied by the sweep instead of drawn as a gap.
            #
            # It sweeps low over the shaded (right) side and its lowest inner point is
            # hy-vy(40); her brows are at hy-34, so it clears them by 5px at the worst point.
            parts.append((_poly([
                (cx - hx(64), hy - vy(22)), (cx - hx(62), hy - vy(62)),
                (cx - hx(8), hy - vy(78)), (cx + hx(58), hy - vy(64)),
                (cx + hx(64), hy - vy(18)),
                (cx + hx(48), hy - vy(40)), (cx, hy - vy(58)),
                (cx - hx(54), hy - vy(46)),
            ]), av.hair))
            if "fringe" in av.extras:
                # A blunt fringe, cut straight across just above the brows. Drawn after the
                # sweep so it overlays it: the sweep implies a part, and a fringe is what
                # replaces one. It is a haircut, not a signifier — heavy, straight and level is
                # simply what thick black hair does when it is cut in a line, and at this size a
                # hard horizontal edge is the only way to say "blunt cut" at all.
                #
                # Bottom at hy-vy(50), NOT hy-vy(38). The first attempt stopped 4px above where
                # I thought the brow was and the brow turned out to be drawn at hy-34 to hy-30,
                # i.e. touching it — and in `av.hair`, the SAME colour as the fringe. Fused into
                # one black mass, so the fringe's lower edge read as her hairline and she
                # appeared to have no eyebrows at all. A face with eyes and no brows is the
                # single most reliable way to make a character look uncanny, which is exactly
                # how it was reported: "off-putting".
                #
                # Verified by dumping pixel rows rather than by eye: skin at rows 26-29, hair
                # tone at 24-25 (the brow, invisible against the fringe above it), eye ink from
                # 32. There was no forehead between fringe and brow at all.
                parts.append((_poly([
                    (cx - hx(54), hy - vy(66)), (cx + hx(54), hy - vy(66)),
                    (cx + hx(50), hy - vy(50)), (cx - hx(50), hy - vy(50)),
                ]), av.hair))
            # The lengths, falling past the jaw onto the shoulders.
            #
            # ROUND 5. Two changes, both forced by her new posture, both caught on the
            # flat-black silhouette render and invisible in colour:
            #
            #   * the bottom edge carries `av.lean`. This hair falls ONTO the shoulder, so
            #     when the body settles away from the head the lengths have to follow it down
            #     or they stop short of it.
            #   * the inner edge FLARES inward below the jaw (`hy + vy(50)` down). Straight
            #     lengths left a wedge of bare canvas between the hair and the neck once the
            #     shoulder dropped, which rendered as two white holes either side of her
            #     throat — the single worst kind of defect this file ships, since at 8x it
            #     looks like shading and at 1x it is a pair of eyes cut out of her collar.
            #     The flare starts BELOW the cheekbones on purpose: bringing the whole inner
            #     edge in would narrow the visible face, which is the failure the head_rx
            #     note above already records paying to fix.
            for side in (-1, 1):
                outer = cx + side * hx(80)
                inner = cx + side * hx(50)
                inner_low = cx + side * hx(30)
                parts.append((_poly([
                    (outer, hy - vy(40)), (inner, hy - vy(46)), (inner, hy + vy(50)),
                    (inner_low, hy + vy(84) + av.lean), (outer, hy + vy(66) + av.lean),
                ]), av.hair))
        elif av.hair_style == "bob":
            # A blunt bob to the jaw. This started as a ponytail and the ponytail did not work,
            # for a reason worth writing down rather than re-attempting: the tail of a ponytail
            # goes BEHIND the head, and this is a head-and-shoulders crop with no behind. What
            # rendered was a dark mass down one side, which reads as loose hair — the exact
            # thing the gather was supposed to replace — plus an asymmetry that looked like an
            # accident rather than a style.
            #
            # A bob has its whole shape in the front plane, so it survives the crop. It is also
            # symmetric, which is its own argument here: she is the one character in the cast
            # whose posture is deliberately symmetrical (stillness is her poise), and a
            # lopsided haircut was quietly fighting that.
            parts.append((_poly([
                (cx - hx(64), hy - vy(22)), (cx - hx(62), hy - vy(62)),
                (cx - hx(8), hy - vy(78)), (cx + hx(58), hy - vy(64)),
                (cx + hx(64), hy - vy(18)),
                (cx + hx(48), hy - vy(40)), (cx, hy - vy(58)),
                (cx - hx(54), hy - vy(46)),
            ]), av.hair))
            # The lengths. Not a blunt bob — the blunt cut read as tidy rather than as anything
            # you would call beautiful, which is a real distinction at this size: a hard
            # horizontal says "cut in a line" and stops there.
            #
            # These fall past the jaw onto the shoulder and carry a flare: the outer edge
            # widens to hx(86) at cheek height before drawing back in, and the bottom is a
            # STEP rather than a level cut. Both exist to imply a curve on a grid that has no
            # curves — the widest point sitting below the ear is what the eye reads as hair
            # falling around something rather than hanging off it.
            #
            # The inner edge flares in hard below the jaw (hy+vy(56) onward). That is not
            # styling: straight inner edges leave a wedge between hair, neck and shoulder that
            # renders as a sealed hole, which this file has now shipped three times and caught
            # here a fourth by running the check.
            # One length falls OVER the shoulder and the other goes BEHIND it.
            #
            # The behind side is done by ENDING the shape at the shoulder line, not by pushing
            # it earlier in the draw order. Inserting it before the torso does make the shoulder
            # occlude it — but `parts` is one list and the HEAD is drawn late, so it went behind
            # the head as well and took the hair away from the side of her face, leaving a bare
            # band of cheek out to where the hair restarted. Hair that stops where the shoulder
            # begins reads as falling behind it and still frames the face.
            #
            # Why bother: two lengths laid symmetrically over the front of both shoulders is
            # the most static way hair can sit. Real hair picks a side. It also gives her the
            # only asymmetry she has, on a character whose posture is deliberately symmetrical
            # — a small one, in the hair alone, reads as life rather than as a lean.
            for side in (-1, 1):
                over = side == -1
                # The behind side sweeps WIDER before it disappears: it has only the few rows
                # above the shoulder line to say anything, so the flare has to happen there.
                flare = hx(86) if over else hx(96)
                length = _poly([
                    (cx + side * hx(66), hy - vy(44)), (cx + side * hx(46), hy - vy(48)),
                    (cx + side * hx(46), hy + vy(24)),
                    (cx + side * hx(34), hy + vy(56)),
                    # hx(24) at hy+66 is the point that actually meets the neck. Without it the
                    # inner edge passed about 11px outboard of the neck for two rows just above
                    # the shoulder line and left an 8px sealed hole — found by the check, not by
                    # looking, for the fourth time on this cast.
                    (cx + side * hx(24), hy + vy(66 if over else 62)),
                    # Longer. The reference is hair well past the shoulder, and at a
                    # head-and-shoulders crop "long" has to be spent on the few rows below the
                    # shoulder line or it does not exist — above it, every length looks the
                    # same. The over side now runs to hy+118, roughly the bottom of the frame,
                    # so it reads as continuing past what we can see rather than stopping.
                    # The lower inner edge sweeps OUT to hx(62), not down at hx(46). Hands are
                    # drawn before hair, so a length that stays narrow all the way down lands
                    # on top of them and buries the near hand under a dark curtain. Sweeping
                    # outward puts the fall beside the arm, which is where hair that long
                    # actually goes when someone's hands are forward on a table.
                    (cx + side * hx(62 if over else 46), hy + vy(118 if over else 60) + av.lean),
                    (cx + side * hx(84 if over else 78), hy + vy(104 if over else 58) + av.lean),
                    (cx + side * flare, hy + vy(34)),
                    (cx + side * hx(80), hy - vy(6)),
                ])
                parts.append((length, av.hair))
        elif av.hair_style == "plaits":
            # ROUND 2 MERGE, from Designer A, replacing my round bunches. A's plait is three
            # segments per side, each shorter and narrower than the last, stepping down and
            # slightly in, with a ribbon tie at each end. That taper-and-step is what a braid
            # IS at this size — a single fat block level with the jaw reads as an ear muff,
            # which is the exact failure I hit twice with bunches and A hit once with braids.
            #
            # THE ONE THING I CHANGED FROM A'S: the outward offsets. A's build has wider
            # shoulders than mine; on my narrow-shouldered child, plaits hugging the skull
            # would collapse the head silhouette below the shoulder silhouette and lose the
            # head-wider-than-shoulders ratio that the review called the only true "child" cue
            # in either cast. The first segment therefore pushes out to head_rx+34, not +28.
            R = av.head_rx
            parts.append((_poly([
                (cx - R + 2, hy - av.head_ry + vy(10)),
                (cx + R - 2, hy - av.head_ry + vy(10)),
                (cx + R - 6, hy - vy(26)), (cx - R + 6, hy - vy(30)),
            ]), av.hair))
            for side in (-1, 1):
                parts.append((_poly([
                    (cx + side * (R - 6), hy - vy(14)), (cx + side * (R + 30), hy - vy(22)),
                    (cx + side * (R + 42), hy + vy(18)), (cx + side * (R + 4), hy + vy(22)),
                ]), av.hair))
                # Segments 2 and 3 sit 8px further IN than they were authored (R-2 / R+2
                # rather than R+6 / R+10). Nothing to do with how a plait looks and everything
                # to do with what happens under it: with her shoulders up around a low head,
                # cheek, plait and coat stopped meeting beside her ear and left a notch cut
                # right through the silhouette. The OUTER offsets are untouched — those are
                # the ones carrying her head-wider-than-shoulders read.
                parts.append((_poly([
                    (cx + side * (R - 2), hy + vy(16)), (cx + side * (R + 30), hy + vy(12)),
                    (cx + side * (R + 28), hy + vy(50)), (cx + side * R, hy + vy(52)),
                ]), av.hair))
                # ...and the tail segment comes in to R+2 for the same reason. Both inner
                # edges were pulled inboard independently — once on the live branch and once
                # here — after the same defect was found twice: the head is an ELLIPSE, so by
                # hy+30 this skull has narrowed to about |x|=49 while the plait began at |x|=64
                # and the shoulder line does not start until hy+42. The wedge between jaw,
                # plait and shoulder belonged to no shape, and came out as a hole punched clean
                # through her in all four expressions, with the room visible through her neck.
                #
                # Closed inboard rather than by widening the shoulder, which would have eaten
                # the head-wider-than-shoulders ratio the review measured as the only true
                # child cue in the cast. Hair falling onto a shoulder is what a plait does.
                # `check_avatar_holes.py` is what stops this recurring silently: it shipped
                # once precisely because transparency renders as whatever is behind it, so a
                # hole through a character is invisible in every colour render at every zoom.
                parts.append((_poly([
                    (cx + side * (R + 2), hy + vy(46)), (cx + side * (R + 26), hy + vy(44)),
                    (cx + side * (R + 20), hy + vy(76)), (cx + side * (R + 4), hy + vy(76)),
                ]), av.hair))
        elif av.hair_style == "sideburns":
            # Hard against the edge of the head (hx 46..62 on a 60px half-width) so they read as
            # hair coming down from under the cap. At the fixed 40..52 they were authored at,
            # they floated a clear 8px inside the silhouette on his wider head and read as two
            # dark straps stuck to his cheeks.
            for side in (-1, 1):
                x0, x1 = sorted((cx + side * hx(46), cx + side * hx(62)))
                parts.append((_poly([
                    (x0, hy - vy(50)), (x1, hy - vy(50)), (x1, hy - vy(8)), (x0, hy - vy(16)),
                ]), av.hair))

    # Facial hair, before the hat so the brim can overlap the hairline.
    if av.facial == "moustache":
        parts.append((_poly([
            (cx - 48, hy + 20), (cx - 10, hy + 10), (cx, hy + 17),
            (cx + 10, hy + 10), (cx + 48, hy + 20),
            (cx + 38, hy + 34), (cx, hy + 25), (cx - 38, hy + 34),
        ]), av.facial_colour))
    elif av.facial == "beard":
        # A full beard is a JAW SHAPE, not hair texture: it replaces the chin silhouette, which
        # is what makes it read instantly against the clean-shaven and moustached heads.
        # Tapered to a jaw rather than squared off: the first pass ran the full width down to
        # hy+68 and read as a bib hung under the chin instead of hair growing on one. It also
        # started at hy+2, level with the bottom of the eyes, so it swallowed the cheeks and
        # left nowhere for an expression to happen. It now starts below the nose and covers the
        # jaw, which is where a beard actually grows.
        parts.append((_poly([
            (cx - hx(52), hy + vy(22)), (cx - hx(42), hy + vy(14)),
            (cx + hx(42), hy + vy(14)), (cx + hx(52), hy + vy(22)),
            (cx + hx(42), hy + vy(52)), (cx + hx(16), hy + vy(64)),
            (cx - hx(16), hy + vy(64)), (cx - hx(42), hy + vy(52)),
        ]), av.facial_colour))
    elif av.facial == "thin":
        parts.append((_poly([
            (cx - 30, hy + 14), (cx + 30, hy + 14),
            (cx + 26, hy + 22), (cx - 26, hy + 22),
        ]), av.facial_colour))

    if av.headwear == "none":
        pass  # long hair carries this silhouette on its own
    elif av.headwear == "trapper":
        # Crown kept well clear of the brow line (drawn at hy-24 in the face pass) — the
        # portrait once had the brim landing exactly on the eyebrows and every expression
        # collapsed into a single grey stripe.
        parts += [
            (_poly([
                (cx - hx(58), hy - vy(52)), (cx - hx(58), hy - vy(80)), (cx, hy - vy(96)),
                (cx + hx(58), hy - vy(80)), (cx + hx(58), hy - vy(52)),
            ]), av.headwear_main),
            (_ellipse(cx - hx(72), hy - vy(48), cx - hx(38), hy - vy(4)), av.headwear_trim),
            (_ellipse(cx + hx(38), hy - vy(48), cx + hx(72), hy - vy(4)), av.headwear_trim),
            (_poly([
                (cx - hx(60), hy - vy(58)), (cx + hx(60), hy - vy(58)),
                (cx + hx(60), hy - vy(44)), (cx - hx(60), hy - vy(44)),
            ]), av.headwear_trim),
        ]
    elif av.headwear == "kerchief":
        # Tied at the back, so the silhouette is a triangle sloping DOWN past the ears rather
        # than a horizontal band — the one shape in the set with no straight brim at all.
        parts += [
            (_poly([
                (cx - hx(64), hy - vy(16)), (cx - hx(40), hy - vy(76)), (cx + hx(40), hy - vy(76)),
                (cx + hx(64), hy - vy(16)), (cx + hx(44), hy - vy(26)), (cx - hx(44), hy - vy(26)),
            ]), av.headwear_main),
            # Knot and tail off the shaded side.
            (_poly([
                (cx + hx(54), hy - vy(30)), (cx + hx(78), hy - vy(22)),
                (cx + hx(70), hy + vy(2)), (cx + hx(52), hy - vy(8)),
            ]), av.headwear_main),
            (_poly([
                (cx - hx(44), hy - vy(30)), (cx + hx(44), hy - vy(30)),
                (cx + hx(44), hy - vy(22)), (cx - hx(44), hy - vy(22)),
            ]), av.headwear_trim),
        ]
    elif av.headwear == "bowler":
        # Low rounded crown over a WIDE flat brim: the brim is the character, so it runs past
        # the head by a clear margin on both sides.
        parts += [
            (_ellipse(cx - 46, hy - 92, cx + 46, hy - 28), av.headwear_main),
            (_poly([
                (cx - 84, hy - 40), (cx + 84, hy - 40),
                (cx + 84, hy - 26), (cx - 84, hy - 26),
            ]), av.headwear_main),
            (_poly([
                (cx - 48, hy - 48), (cx + 48, hy - 48),
                (cx + 48, hy - 40), (cx - 48, hy - 40),
            ]), av.headwear_trim),
        ]
    elif av.headwear == "flatcap":
        # The only ASYMMETRIC shape in the cast. A flat cap's crown is pulled over to one side
        # and its peak juts forward-and-across, so from the front it overhangs one temple and
        # not the other. Every other head here is a mirror image of itself; his is not, and that
        # is worth more for telling four people apart than any amount of hat colour.
        #
        # The peak sits at hy-vy(48)..hy-vy(36) and his brows are at hy-32: a 4px gap at the
        # nearest point. That clearance is the whole reason it is drawn this high — the brim
        # landing on the eyebrows is the failure this file has hit twice, and a peaked cap has
        # more brim to land with than anything else here.
        parts += [
            (_poly([
                (cx - hx(68), hy - vy(46)), (cx - hx(64), hy - vy(70)),
                (cx - hx(16), hy - vy(82)), (cx + hx(44), hy - vy(72)),
                (cx + hx(60), hy - vy(52)), (cx + hx(60), hy - vy(44)),
            ]), av.headwear_main),
            # Peak, seen almost edge-on: a shallow wedge UNDER the crown, dipping as it runs out
            # past the head on the lit side. Two earlier versions failed the same way — drawn
            # thin and high, with clear air between it and the crown, it read as a plank someone
            # had rested on his forehead. It now overlaps the crown for 6px along its whole
            # length, so hat and peak are one object.
            (_poly([
                (cx - hx(84), hy - vy(48)), (cx - hx(62), hy - vy(56)),
                (cx + hx(56), hy - vy(54)), (cx + hx(56), hy - vy(44)),
                (cx - hx(60), hy - vy(40)), (cx - hx(82), hy - vy(36)),
            ]), av.headwear_trim),
        ]
    elif av.headwear == "beanie":
        # Hugs the skull and ends in a bobble — no brim anywhere, which is what separates it
        # from the bowler at a glance. The band sits well clear of the brow: at its first
        # height it landed 4px above the eyes, and between it and a beard that began at the eye
        # line his face was a letterboxed strip with no room to hold an expression.
        # Sat 8px lower than first drawn: the bobble was an ellipse from hy-104, and with
        # hy=92 that is y=-12 — entirely off the top of the canvas, so the one shape that makes
        # a beanie a beanie was invisible. Anything above hy-92 is off-canvas here.
        parts += [
            (_poly([
                (cx - hx(58), hy - vy(30)), (cx - hx(50), hy - vy(66)), (cx, hy - vy(80)),
                (cx + hx(50), hy - vy(66)), (cx + hx(58), hy - vy(30)),
            ]), av.headwear_main),
            (_poly([
                (cx - hx(60), hy - vy(46)), (cx + hx(60), hy - vy(46)),
                (cx + hx(60), hy - vy(28)), (cx - hx(60), hy - vy(28)),
            ]), av.headwear_trim),
            (_ellipse(cx - hx(14), hy - vy(92), cx + hx(14), hy - vy(72)), av.headwear_trim),
        ]
    return parts


def draw_avatar_face(img: Image.Image, expression: str, av) -> None:
    """An avatar's face. Four states, sharing `useOpponentExpression`'s existing
    idle/happy/rueful contract plus a `blink` frame that only the idle timer ever asks for.

    **Rebuilt in 2g.5, for two reasons that turned out to be the same reason.**

    Before this, the head was ONE FLAT SKIN ELLIPSE. No brow, no nose, no cheekbone, no jaw,
    no chin, no age line — on a character whose name is "Old-Timer" — with its only modelling
    the generic 2px shadow band `composite_sprite` puts under every part. Six colours on the
    most prominent figure on screen, and no `ramp()` reaching him at all.

    Separately, coarsening the room's grid in 2g.2 broke him: the eyes were 16x20 ellipses,
    which at a 4px grid became 4x5 blocks and rendered as diamonds. He was left on the fine
    grid as a stopgap, out of step with every other object in the room.

    Both are fixed by drawing him the way pixel art actually draws a face at this size: with
    RECTANGLES ON THE GRID, not ellipses hoping to survive quantisation. A pixel-art eye is a
    rectangle. Every feature below is a multiple of 4 draw pixels and sits on a multiple-of-4
    coordinate, so the coarse grid is what it was authored for rather than something applied
    to it afterwards.
    """
    d = ImageDraw.Draw(img)
    hy = OPP_HEAD_CY + av.head_dy
    # Two centre lines and two anchors from round 5 on, and every mark below belongs to
    # exactly one pair. Anything on the FACE hangs off (cx, hy) — the head, which can sit off
    # the body's centre line. Anything on the GARMENT or the hands hangs off (OPP_CX, sy) —
    # the body, which leans. Mixing them is how a brooch ends up floating off a throat.
    cx = OPP_CX + av.head_dx
    sy = OPP_HEAD_CY + av.lean
    eye_y = hy - 8 + av.brow_dy
    skin_hi, _, skin_sh, skin_deep = ramp(av.skin)
    # Desaturated, then pulled back toward the base by the same knob — ONE skin shadow for
    # the whole face. Both steps matter and both are identities at shadow_desat 0, so the
    # Old-Timer is untouched. The second step is why the jaw plane stopped being a grey slab
    # pasted over one cheek; keeping it as a SEPARATE softened tone instead cost a colour in
    # every band it crossed and put the Regular at 66 of 64.
    skin_sh = _mix(av.skin, _desat(skin_sh, av.shadow_desat), 1.0 - av.shadow_desat * 0.5)
    skin_deep = _desat(skin_deep, av.shadow_desat)
    # And the highlight pulled back toward the base by the same knob. `ramp()` overshoots
    # upward as hard as it oversaturates downward, and on a bare face the nose ridge came
    # back as a white-ish block stuck between the eyes. At shadow_desat 0 this is the
    # identity, which is what keeps the Old-Timer's lit brow ridge exactly as drawn.
    skin_hi = _mix(av.skin, skin_hi, 1.0 - av.shadow_desat * 0.5)
    # Horizontal distances scaled to this head's width, exactly as `_avatar_parts` does. At the
    # Old-Timer's head_rx=62 this is the identity, which is what lets the modelling below be
    # parameterised without moving a single pixel of his sprite.
    hxx = lambda v: round(v * av.head_rx / 62)

    # Stubble, before the features rather than with the other extras at the foot of this
    # function: it is a SURFACE the mouth and nose sit on, and drawn in extras order it painted
    # straight over his mouth.
    if "cheekbone" in av.extras:
        # An actual cheekbone: a lit plane on the hearth side, a hollow under BOTH cheekbones,
        # and a jaw line on the shaded side. She had the largest unmodelled expanse of skin of
        # the four and the most headroom to spend on it — this is three named planes where
        # there was one flat field.
        # All three planes mixed halfway back toward the base tone. At full ramp strength the
        # lit plane was a spotlight on her cheek and the hollows were two dark blocks that read
        # as sideburns. A cheekbone is a TURN in a surface; the shape has to be readable and
        # the step across it small.
        # A soft-featured face wants the planes mixed back toward the base; a weathered one
        # can take them at full strength — and taking them at full strength means reusing two
        # tones the sprite already has, so the Regular's cheekbone costs nothing at all. Same
        # trick as his jug ears last round.
        lit = _mix(av.skin, skin_hi, 0.85) if av.soft_features else skin_hi
        hollow = _mix(av.skin, skin_sh, 0.55) if av.soft_features else skin_sh
        d.polygon([(cx - hxx(44), hy - 6), (cx - hxx(20), hy + 2),
                   (cx - hxx(24), hy + 12), (cx - hxx(44), hy + 6)], fill=lit)
        for side in (-1, 1):
            d.polygon([(cx + side * hxx(46), hy + 16), (cx + side * hxx(24), hy + 22),
                       (cx + side * hxx(28), hy + 30), (cx + side * hxx(44), hy + 28)],
                      fill=hollow)
        d.polygon([(cx + hxx(42), hy + 34), (cx + hxx(22), hy + 52),
                   (cx + hxx(30), hy + 56), (cx + hxx(44), hy + 40)], fill=hollow)
    if "blush" in av.extras:
        # Two tidy round patches, not a smear. Her cheeks were carrying the seam between two
        # `light_from` bands and nothing else, and on a face that pale a band edge with no
        # feature near it reads as a smudge of dirt. A blush is a thing you can name sitting
        # exactly where the seam was.
        for side in (-1, 1):
            for dx, dy, w in ((30, 6, 16), (26, 14, 20), (32, 22, 12)):
                x0, x1 = sorted((cx + side * hxx(dx), cx + side * hxx(dx + w)))
                d.rectangle((x0, hy + dy, x1, hy + dy + 8), fill=_mix(av.skin, BLUSH, 0.42))
    if "stubble" in av.extras:
        # Three days of it, on the JAW ONLY and in the skin's own deep tone. Two failures got it
        # here. Run up to the cheekbones (hy+6) it was a beard, not stubble. Mixed toward INK it
        # went grey, and a hard grey shape across the lower face read as a bandana. It has to
        # stay inside the skin family and stay below the nose — stubble is a change of SURFACE,
        # and the moment it becomes a change of COLOUR it stops being stubble.
        d.polygon([(cx - hxx(48), hy + 26), (cx - hxx(40), hy + 18),
                   (cx + hxx(40), hy + 18), (cx + hxx(48), hy + 26),
                   (cx + hxx(42), hy + 50), (cx + hxx(18), hy + 62),
                   (cx - hxx(18), hy + 62), (cx - hxx(42), hy + 50)],
                  fill=_mix(av.skin, skin_deep, 0.5))

    # --- Modelling, under the features. Warm light from the left (hearth), so the right side
    # of the face carries the shadow — consistent with light_from's direction. ---
    # Cheekbone and jaw shadow down the shaded side.
    if av.soft_features:
        # A narrower cheek shadow that stops short of the jaw, so the face keeps its form
        # without the heavy blocked-in jawline. Mixed halfway back toward the base tone rather
        # than using the full shadow: `ramp()` scales its shadow from the base, so on the
        # deeper complexion the same polygon landed dark enough to read as a bruise rather than
        # as modelling.
        soft_sh = _mix(av.skin, skin_sh, 0.55)
        d.polygon([(cx + hxx(24), hy - 12), (cx + hxx(44), hy - 18),
                   (cx + hxx(46), hy + 6), (cx + hxx(28), hy + 18)], fill=soft_sh)
        # Brow ridge in two PADS, one over each eye, rather than one bar edge to edge. The bar
        # was authored on a 62px-wide head and hard-coded at +-44; on the card sharp's 56px head
        # it reached almost her full face width, and a full-width light horizontal across the
        # forehead does not read as bone — it reads as a headband. Pads leave lit forehead
        # between them, which is what a brow ridge actually looks like.
        for side in (-1, 1):
            bx0, bx1 = sorted((cx + side * (av.eye_dx - av.eye_w - 8),
                               cx + side * (av.eye_dx + av.eye_w + 8)))
            if av.lid == "creased":
                # `soft_sh`, not `skin_sh` — the same softened tone this block already uses for
                # the cheek. Using the full shadow here while the cheek beside it was softened
                # was an inconsistency, and on the child's very pale skin it landed as a mauve
                # band straight across both upper lids: at native scale that reads as bruising
                # or as heavy eyeshadow on a ten-year-old, which is most of why her face was
                # reported as off-putting. A crease is a crease, not a cosmetic.
                d.rectangle((bx0, eye_y - 18, bx1, eye_y - 14), fill=soft_sh)
            if "brow_ridge" in av.extras:
                d.rectangle((bx0, eye_y - 22, bx1, eye_y - 18), fill=skin_hi)
    else:
        # Mixed back toward the base by the same knob. This polygon covers a third of the
        # face; at full shadow strength on the Regular it stopped being a jaw plane and became
        # a grey slab pasted over one cheek. `_mix(skin, skin_sh, 1.0)` is skin_sh exactly, so
        # the Old-Timer (shadow_desat 0) gets the identical fill he always had.
        d.polygon([(cx + 20, hy - 20), (cx + 52, hy - 28), (cx + 56, hy + 16),
                   (cx + 28, hy + 40), (cx + 16, hy + 24)], fill=skin_sh)
        # Brow ridge: the face's strongest form, and what makes a head read as bone not egg.
        d.rectangle((cx - 48, eye_y - 20, cx + 48, eye_y - 12), fill=skin_sh)
        if "brow_ridge" in av.extras:
            # The LIT top of the brow ridge. On the Old-Timer this band is entirely covered by
            # his hat brim and hair, which is the only reason it survived three rounds: on a
            # bare forehead a full-width light horizontal does not read as bone, it reads as a
            # pale STRIPE painted across the head — the same defect as the "white sweatband"
            # already fixed once on the soft-featured branch. Opt-in now, and only he opts in.
            d.rectangle((cx - 48, eye_y - 24, cx + 48, eye_y - 20), fill=skin_hi)
    # Nose: a lit ridge with its own shadow to the right, and a nostril line under it. It STOPS
    # ABOVE THE MOUSTACHE (which `_opponent_parts` draws from hy+10) — the first pass ran it to
    # hy+12 and split the moustache in half with a skin-coloured bar straight down the middle.
    # Anchored to eye_y, NOT to hy. This was a real bug and the Kid was where it showed: her
    # `brow_dy=+8` moves the whole feature cluster down the face, so her eyes sat at hy while
    # the nose base stayed pinned at hy+4 — a nose eight pixels tall, ending level with the
    # bottom of her own eyes. That is the client's "her nose is nearly invisible": it was not
    # low-contrast, it was almost not drawn. At the Old-Timer's brow_dy=0, eye_y is hy-8 and
    # this expression is hy+4 exactly as before, so his sprite is untouched.
    nb = eye_y + 12 + av.nose_dy
    # Where the lit ridge STARTS is the bridge height. Running it from eye_y-8 carries it up
    # between the brows, which is a high European bridge; starting it level with the eyes gives
    # a lower one. Only the top moves — the tip, nostrils and shadow are unchanged.
    # `nose_dy` moves the base. On a low bridge it has to move the TOP as well, or raising the
    # base just stretches the nose downward from a fixed point near the eyes and it still reads
    # as sitting high on the face. Her base was at hy+2 against a chin at hy+58 — the nose was
    # in the upper third of the face, which is where a nose is not.
    nose_top = (eye_y - 2 + av.nose_dy) if "low_bridge" in av.extras else eye_y - 8
    d.rectangle((cx - av.nose_w, nose_top, cx + av.nose_w, nb), fill=skin_hi)
    d.rectangle((cx + av.nose_w, max(eye_y - 4, nose_top), cx + av.nose_w + 8, nb), fill=skin_sh)
    if "nose_tip" in av.extras:
        # A lit bead on the tip, under the ridge and above the nostrils. With a low bridge the
        # ridge is short by design, so without this the nose is two nostril dots and nothing
        # else — present, but not a shape, which is the "eh whatever" it was reported as. Four
        # pixels of highlight is what turns a mark into a tip.
        d.rectangle((cx - av.nose_w + 1, nb - 6, cx + av.nose_w - 1, nb - 2), fill=skin_hi)
    if "soft_nose" in av.extras:
        # A narrower nose than `nostrils` builds. That one draws a tip shadow from -(w+4) to
        # +(w+8) — 18px of horizontal bar — plus two 4px nostril blocks inside it, and once her
        # nose came down onto the fuller part of the face that bar was the whole feature: a
        # smudge lying across the middle of her face rather than something with a front and
        # sides. It is the right construction for the Regular's broad weathered nose and the
        # wrong one for hers.
        #
        # Here the shadow is 12px, the nostrils are single 4px marks tucked at its ends, and the
        # ridge above carries the read instead. Less nose, more nose.
        # NO base bar at all — just two marks flanking the ridge. Two passes at narrowing the
        # bar both still read as a horizontal smudge across the middle of her face, because a
        # 4px-tall rectangle wider than it is tall IS a bar however narrow you make it. The main
        # nose code already draws a vertical ridge highlight and a shadow down its shaded side;
        # those two are the nose. All the base needs is where the nostrils are, and the ridge
        # left standing between them is what makes it read as having a front.
        for side in (-1, 1):
            nx0, nx1 = sorted((cx + side * (av.nose_w + 1), cx + side * (av.nose_w + 5)))
            d.rectangle((nx0, nb - 4, nx1, nb), fill=_mix(skin_sh, skin_deep, 0.55))
    elif "nostrils" in av.extras:
        # A nostril each side of the tip rather than one dark bar under it. The bar was the
        # whole nose at this size — the client's "the nose barely registers" — because a bar
        # has no shape to read. Tip shadow first, then two 4px holes in it.
        d.rectangle((cx - av.nose_w - 4, nb - 4, cx + av.nose_w + 8, nb), fill=skin_sh)
        for side in (-1, 1):
            nx0, nx1 = sorted((cx + side * (av.nose_w + 4), cx + side * (av.nose_w + 8)))
            d.rectangle((nx0, nb - 4, nx1, nb), fill=skin_deep)
        if "bridge" in av.extras:
            # A kink in the bridge. Every ordinary bloke's nose has been hit by something.
            d.rectangle((cx - av.nose_w - 4, eye_y + 4, cx - av.nose_w, eye_y + 12),
                        fill=skin_sh)
    else:
        d.rectangle((cx - av.nose_w - 4, nb - 4, cx + av.nose_w + 8, nb), fill=skin_deep)
    # Age lines — the whole point of a character called the Old-Timer. Crow's feet only: the
    # nasolabial folds this originally also carried ran straight through the moustache, and
    # the brow ridge, cheekbone and crow's feet already do the work. Kept to 4px marks, since
    # a wrinkle drawn thinner than the grid is noise rather than detail.
    if av.age_lines:
        for side in (-1, 1):
            tx = cx + side * (av.eye_dx + 20)
            for dy in (-8, 0, 8):
                x0, x1 = sorted((tx, tx + side * 12))
                d.rectangle((x0, eye_y + dy, x1, eye_y + dy + 4), fill=skin_sh)

    # --- Features. Rectangles, on the grid. ---
    # A smirking character keeps her resting eye through `happy`; everything else about the
    # expression (brow, mouth) still changes.
    eye_expr = "idle" if (av.smirk and expression == "happy") else expression
    for side in (-1, 1):
        ex = cx + side * av.eye_dx
        if eye_expr == "happy":
            # Closed-and-creased: a flat bar with a lift at the outer end.
            d.rectangle((ex - av.eye_w - 4, eye_y, ex + av.eye_w + 4, eye_y + 4), fill=INK)
            hx0, hx1 = sorted((ex + side * (av.eye_w + 4), ex + side * (av.eye_w + 8)))
            d.rectangle((hx0, eye_y - 4, hx1, eye_y), fill=INK)
        elif eye_expr == "blink":
            d.rectangle((ex - av.eye_w - 4, eye_y - 4, ex + av.eye_w + 4, eye_y), fill=INK)
        else:
            d.rectangle((ex - av.eye_w, eye_y - av.eye_up, ex + av.eye_w, eye_y + av.eye_dn),
                        fill=INK)
            d.rectangle((ex - av.eye_w, eye_y - av.eye_up, ex - av.eye_w + 4, eye_y - av.eye_up + 4),
                        fill=(255, 255, 255, 255))
        # Eye socket shadow, so the eye sits IN the head rather than on it.
        d.rectangle((ex - av.eye_w - 4, eye_y + av.eye_dn, ex + av.eye_w + 4,
                     eye_y + av.eye_dn + 4), fill=skin_sh)
        if "lashes" in av.extras and eye_expr not in ("happy", "blink"):
            # ROUND 2 MERGE, from Designer A. Four pixels of lash lifted at the outer corner —
            # the one feature that carries glamour at this size without a single curve. Skipped
            # on happy and blink, where the eye is already a closed bar and a lash on top of it
            # just thickens the bar.
            lx0, lx1 = sorted((ex + side * av.eye_w, ex + side * (av.eye_w + 8)))
            d.rectangle((lx0, eye_y - av.eye_up - 4, lx1, eye_y - av.eye_up), fill=av.hair)

    # Brows follow the character: grey on the Old-Timer, otherwise their own hair colour,
    # so a young face doesn't get an old man's eyebrows.
    brow = BEARD_GRAY if av.age_lines else (av.brow_colour or av.hair or av.facial_colour)
    by = eye_y - 24
    for side in (-1, 1):
        x_out = cx + side * (av.eye_dx + av.brow_span[0])
        x_in = cx + side * (av.eye_dx + av.brow_span[1])
        if expression == "rueful":
            d.line((x_out, by - 8, x_in, by + 4), fill=brow, width=av.brow_h)
        elif expression == "happy":
            d.line((x_out, by + 4, x_in, by - 4), fill=brow, width=av.brow_h)
        else:
            d.line((x_out, by, x_in, by), fill=brow, width=av.brow_h)

    my = hy + 40
    mw = av.mouth_w
    # ROUND 2 MERGE, from Designer A: the mouth takes the character's accent colour where they
    # have one. I argued in round 1 that lip colour was a cliche and left it off; the review
    # agreed with A that without it the Card Sharp reads close to androgynous, and A's render
    # proves four pixels of rose survives at 150x140. `lip` falls back to INK, so the
    # Old-Timer's mouth (under his moustache) is unchanged.
    lip = av.accent if "lips" in av.extras else INK
    if expression == "happy" and av.smirk:
        # The same mouth, lifted at ONE corner and dropped a row at the other. Symmetry is
        # what makes a grin read as a grin; break it and the identical shape reads as a person
        # deciding whether to let you see she is pleased. Lifted on the hearth-lit side, where
        # there is contrast to see four pixels move.
        d.rectangle((cx - mw, my, cx + mw, my + 8), fill=lip)
        d.rectangle((cx - mw - 4, my - 8, cx - mw, my + 4), fill=lip)
        d.rectangle((cx + mw - 4, my + 8, cx + mw, my + 12), fill=lip)
    elif expression == "happy":
        d.rectangle((cx - mw, my, cx + mw, my + 8), fill=lip)
        for side in (-1, 1):
            mx0, mx1 = sorted((cx + side * mw, cx + side * (mw + 4)))
            d.rectangle((mx0, my - 8, mx1, my), fill=lip)
    elif expression == "rueful":
        d.rectangle((cx - mw + 4, my + 8, cx + mw - 4, my + 12), fill=lip)
        for side in (-1, 1):
            mx0, mx1 = sorted((cx + side * (mw - 4), cx + side * mw))
            d.rectangle((mx0, my, mx1, my + 8), fill=lip)
    elif av.facial == "none":
        # A resting mouth. Before this, `idle` and `blink` drew NO MOUTH AT ALL — which nobody
        # noticed while the only avatar was an Old-Timer with a moustache parked over the spot.
        # On three clean-shaven faces it is the first thing you see: two eyes, a nose, and a
        # blank chin. Guarded on `facial` so his moustache still owns that space and his four
        # sprites stay byte-identical.
        #
        # Not INK. A full-strength black slot at rest reads as an open mouth, or as a slot; a
        # line mixed most of the way to the skin reads as lips closed.
        # A mouth with an UPPER and a LOWER lip, not a single 4px bar. The bar was legible as
        # "there is a mouth here" and nothing more; two rows plus a highlight is a shape, and a
        # shape is a thing the player can name.
        # Two constructions, because "a mouth at rest" is not one shape for every face.
        #
        # With lip colour (the Card Sharp), an upper and a lower row plus a highlight reads as
        # LIPS — a shape you can name, which is the whole point of the feature pass.
        #
        # Without it (the Kid, the Regular) the identical construction reads as an open mouth.
        # Round 3 shipped that and the review caught it at native scale: 8px of dark, stacked in
        # two rows, is a hole rather than a closed line, and idle is the state these characters
        # sit in for most of a game — so both of them looked permanently startled. A single 4px
        # bar, mixed further back toward the skin, is what a closed mouth is at this size.
        # Confirmed by the one face in either designer's round 3 that did NOT have the problem:
        # a flat wide bar reading as a closed, serious line.
        if "soft_lips" in av.extras:
            # Two rows of EQUAL width, upper darker and lower lighter, rather than a wide dark
            # bar with a narrower bright one tucked under it. The old build was a wedge: the
            # darkened top row ran to +-12 and the lip-coloured row only to +-8, so what read
            # first was a heavy horizontal line with a red smudge below it, not a mouth.
            #
            # Equal widths let the two rows read as upper and lower lip, and the value step
            # between them does the work the width step was doing badly. Softer at both ends
            # too: 0.3 toward INK rather than 0.4, and the lower lip lifted toward the skin
            # highlight instead of sitting at full accent, because full-strength lip colour on
            # a face this size is the loudest thing on it.
            d.rectangle((cx - mw + 6, my, cx + mw - 6, my + 4), fill=_mix(lip, INK, 0.3))
            d.rectangle((cx - mw + 6, my + 4, cx + mw - 6, my + 8),
                        fill=_mix(lip, skin_hi, 0.3))
            d.rectangle((cx - 6, my + 4, cx + 2, my + 8), fill=_mix(lip, skin_hi, 0.55))
            # A lift at each corner, 4px, one row above the mouth line. At this size that is
            # the entire difference between a resting face and a pleasant one, and it costs
            # nothing: two pixels of a tone already in the sprite.
            #
            # Deliberately not a curve. A drawn smile needs three or four rows to arc and she
            # only has two, so an attempted curve becomes a wedge. Corners that sit one step
            # higher than the line between them is what the eye reads as a smile here.
            for side in (-1, 1):
                # OVERLAPPING the lip row, not perched above it. Sitting one row up and one
                # step out, the corners touched the mouth only diagonally — which at pixel
                # level is not touching at all — and read as two red dots floating beside her
                # face. A corner has to share pixels with the line it lifts.
                sx0, sx1 = sorted((cx + side * (mw - 10), cx + side * (mw - 4)))
                d.rectangle((sx0, my - 4, sx1, my + 4), fill=_mix(lip, INK, 0.3))
        elif "lips" in av.extras:
            d.rectangle((cx - mw + 4, my, cx + mw - 4, my + 4),
                        fill=_mix(lip, INK, 0.4))
            d.rectangle((cx - mw + 8, my + 4, cx + mw - 8, my + 8), fill=lip)
            d.rectangle((cx - 8, my + 4, cx, my + 8), fill=_mix(lip, skin_hi, 0.45))
        else:
            d.rectangle((cx - mw + 4, my + 2, cx + mw - 4, my + 6),
                        fill=_mix(av.skin, INK, 0.55))

    # Reading glasses. A prior pass gave the frame margin past idle/rueful's own eye rectangle
    # (ex-8, eye_y-12, ex+8, eye_y+8) but kept the outline INK, same as the eye fill — on
    # happy/blink's thin-bar eyes that margin reads fine, but on idle/rueful's large filled
    # eye rectangle an INK outline sitting a couple of px outside an INK fill is optically the
    # same colour as the fill it's next to, and at this resolution (plus the outline's 2px
    # width falling under the CHUNK_ENV*PX=4 snap grid) it merges into one solid block instead
    # of reading as a separate frame — confirmed by pixel-diffing the saved PNGs. Fixed by
    # drawing the frame in GOLD instead: distinct from both the INK eye fill and the SKIN
    # around it on every expression, so the frame reads regardless of eye shape. Width bumped
    # to 4 (a multiple of the snap grid) so it survives the grid consistently rather than
    # partially vanishing depending on alignment. No fill/ramp — filled lenses this small would
    # just read as a second pair of eyes.
    if av.glasses:
        for side in (-1, 1):
            ex = cx + side * av.eye_dx
            d.rectangle((ex - av.eye_w - 4, eye_y - 14, ex + av.eye_w + 4, eye_y + 10),
                        outline=GOLD, width=4)
        d.line((cx - 12, eye_y - 2, cx + 12, eye_y - 2), fill=GOLD, width=4)

    # Short pipe (wave-3 polish). Stem exits the moustache's left corner — that corner sits at
    # (OPP_CX-48, hy+20) in `_opponent_parts`, and both stem points below land inside the
    # moustache polygon there (checked against its actual edges: the top edge runs
    # (OPP_CX-48,hy+20)-(OPP_CX-10,hy+10), the closing edge runs (OPP_CX-38,hy+34)-
    # (OPP_CX-48,hy+20)) so the stem reads as emerging from it with no gap. Kept short and
    # high: the bowl bottoms out at hy+48, well clear of the hands (top out at hy+84), the
    # sleeves (top out at hy+74 on the outer edge, hy+94 on the inner edge nearest the bowl),
    # and the shoulder line (flat top at hy+52, sloping down to hy+74 further out at this x).
    #
    # Drawn here with plain ImageDraw calls rather than as an `_opponent_parts` entry: a part
    # in that list gets `composite_sprite`'s automatic per-part darken()-edge shadow band, and
    # that extra tone landed in a `light_from` x-band (see LIGHT_BANDS) BOOT_DARK's shadow had
    # never appeared in on this sprite, which pushed `_assert_sprite_colours` over its budget —
    # confirmed by regenerating and diffing the colour count against this change reverted.
    #
    # Stem in INK, not BEARD_GRAY: a first pass used BEARD_GRAY to match the moustache it
    # emerges from, but at this size the stem then read as an indistinct extension of the
    # moustache itself rather than a separate shape — confirmed visually in the regenerated
    # PNGs, zoomed. INK is dark enough to read as its own line against both the moustache and
    # the skin behind it, and it's already present in this x-band (the eyes' own INK fill
    # reaches into it on every expression), so it adds no new colour either.
    # --- Per-character detail ----------------------------------------------------------------
    # The Old-Timer earns his read from SPECIFICS: glasses, a pipe, crow's feet, a tin star, a
    # mended patch. Without an equivalent, the others are a hat and a coat colour. These are
    # drawn here rather than as `_avatar_parts` entries so they don't each pick up
    # `composite_sprite`'s automatic per-part shadow band, which is what pushed the pipe over
    # the colour budget when it was tried as a part (see its own note below).
    if "philtrum" in av.extras:
        # The groove between nose and lip, plus the shadow the lower lip casts on the chin.
        # Two four-pixel marks, and they are most of what turns a mouth stuck on a face into a
        # mouth set into one.
        d.rectangle((cx - 4, hy + 30, cx, hy + 38), fill=skin_sh)
        d.rectangle((cx - 12, hy + 52, cx + 12, hy + 56), fill=skin_sh)
    if "laugh_lines" in av.extras:
        # Nasolabial folds. The Old-Timer earns half his read from crow's feet; this is the
        # same idea one age bracket down, and it is the cheapest "lived-in" mark there is.
        for side in (-1, 1):
            d.polygon([(cx + side * hxx(14), hy + 16), (cx + side * hxx(20), hy + 16),
                       (cx + side * hxx(30), hy + 44), (cx + side * hxx(24), hy + 44)],
                      fill=skin_sh)
    if "cleft" in av.extras:
        d.rectangle((cx - 4, hy + 58, cx + 4, hy + 68), fill=skin_sh)
    if "beauty_mark" in av.extras:
        # ROUND 2 MERGE, from Designer A. Four pixels high on the cheek, in the hair's own
        # colour so it costs nothing. It is doing the job my earring was doing — breaking the
        # mirror symmetry of the face — but it does it ON the face, where the eye already is.
        d.rectangle((cx - hxx(30), hy + 12, cx - hxx(30) + 4, hy + 16), fill=av.hair)
    if "sheen" in av.extras:
        # A sheen across the crown. Black hair drawn flat is not hair at this size, it is a
        # HOLE — a shape with no interior information, which is exactly what her previous
        # brown-black version looked like once the value dropped. Two offset bands, brighter on
        # the lit side, and suddenly there is a head under it.
        sheen = _mix(av.hair, STEEL, 0.24)
        d.polygon([(cx - hxx(44), hy - 64), (cx - hxx(10), hy - 76),
                   (cx - hxx(2), hy - 68), (cx - hxx(40), hy - 56)], fill=sheen)
        d.polygon([(cx + hxx(14), hy - 70), (cx + hxx(38), hy - 60),
                   (cx + hxx(36), hy - 52), (cx + hxx(12), hy - 62)],
                  fill=_mix(av.hair, STEEL, 0.12))
    if "beading" in av.extras:
        # Scattered bead/sequin work over the bodice, as on the reference top. Deliberately
        # IRREGULAR — a grid of dots reads as polka dots or as a texture pass, and beadwork is
        # neither; it catches light in clusters. Placed only below the neckline and inboard of
        # the arms so none of it strays onto skin.
        for bx, by in ((-40, 96), (-28, 104), (-34, 118), (-18, 110), (-8, 124),
                       (6, 100), (16, 118), (30, 98), (38, 114), (24, 130),
                       (-46, 132), (44, 130), (0, 140), (-22, 142), (20, 146)):
            d.rectangle((OPP_CX + bx, sy + by, OPP_CX + bx + 4, sy + by + 4), fill=BEAD)
    if "jade_pendant" in av.extras:
        # A fine chain with a jade drop at the throat. Two rows of chain in a gold mixed most of
        # the way back to skin — full GOLD at one pixel wide reads as a scratch, not a chain —
        # and the stone itself carries a single lighter pixel, which is the whole difference
        # between a bead and something polished.
        d.rectangle((OPP_CX - 14, sy + 58, OPP_CX + 14, sy + 60), fill=_mix(GOLD, av.skin, 0.45))
        d.rectangle((OPP_CX - 4, sy + 60, OPP_CX + 4, sy + 64), fill=_mix(GOLD, av.skin, 0.3))
        d.rectangle((OPP_CX - 6, sy + 64, OPP_CX + 6, sy + 74), fill=JADE)
        d.rectangle((OPP_CX - 4, sy + 66, OPP_CX, sy + 70), fill=_mix(JADE, skin_hi, 0.5))
    if "earring" in av.extras:
        # A gold drop, on the lit side only. Two jobs: it is the one asymmetric mark on an
        # otherwise perfectly mirrored face (without it she reads as a mannequin), and gold on
        # black hair is the highest-contrast pairing available in her palette, so a 4px detail
        # actually survives at 150x140.
        d.rectangle((cx - hxx(58), hy + 2, cx - hxx(50), hy + 10), fill=GOLD)
        d.rectangle((cx - hxx(56), hy + 12, cx - hxx(52), hy + 26), fill=GOLD)
    if "brooch" in av.extras:
        # At the throat, where a high collar closes. Body mark: it stays on the body's centre
        # line and rides `sy`, so a head carried off centre leaves it where the collar is.
        d.rectangle((OPP_CX - 6, sy + 44, OPP_CX + 6, sy + 56), fill=GOLD)
        d.rectangle((OPP_CX - 2, sy + 48, OPP_CX + 2, sy + 52), fill=INK)
    if "garters" in av.extras:
        # Sleeve garters — the card player's own tell, and the reason the shirt cuff never
        # slips over the cards. One band per forearm, following the sleeve angle. Positioned
        # off `hand_x`/`hand_dy` (at the default 66 these are the literals they replaced), or
        # a posed arm leaves its own garter hanging in mid air beside it.
        for side, hd in ((-1, av.hand_dy[0]), (1, av.hand_dy[1])):
            x0, x1 = sorted((OPP_CX + side * av.hand_x, OPP_CX + side * (av.hand_x + 30)))
            d.polygon([(x0, sy + 124 + hd), (x1, sy + 112 + hd),
                       (x1, sy + 128 + hd), (x0, sy + 140 + hd)], fill=BOOT_DARK)
    if "ring" in av.extras:
        # On the far hand, so it tracks that hand's own offset.
        d.rectangle((OPP_CX + av.hand_x - 8, sy + 96 + av.hand_dy[1],
                     OPP_CX + av.hand_x, sy + 104 + av.hand_dy[1]), fill=GOLD)
    if "ribbons" in av.extras:
        # The tie at the root of each bunch. Small, but it is the difference between "hair
        # sticking out" and "hair someone tied for her this morning", which is most of what
        # makes her read as a child rather than as a short adult.
        R = av.head_rx
        for side in (-1, 1):
            # One tie where each plait leaves the head, one where it ends. A's note holds: the
            # ribbon has to be the accent and not the yoke cream, because a cream ribbon on
            # blonde hair is the same value as the hair and simply vanishes.
            # Lifted to hy-36..hy-20 from hy-18..hy-2. At the lower placement the two red
            # blocks sat exactly at ear height and read as ear muffs — the same failure the
            # bunches hit twice. A tie belongs where the plait leaves the SKULL, above the ear,
            # not beside it.
            d.polygon([(cx + side * (R + 2), hy - 36), (cx + side * (R + 22), hy - 40),
                       (cx + side * (R + 26), hy - 24), (cx + side * (R + 6), hy - 20)],
                      fill=av.accent)
            # Lifted again in round 5, from hy+58..72 to hy+36..48. It was at the very TIP of
            # the plait, which is where a tie belongs and where it stayed until her hands came
            # up onto the table — at which point two red blocks sat exactly at wrist height,
            # outboard of both hands, and read as cuffs on a pair of red mittens. It now ties
            # the plait at the step between its second and third segments, which is a real
            # place for a tie and is clear of the hands at any pose they can reach.
            d.polygon([(cx + side * (R + 10), hy + 38), (cx + side * (R + 26), hy + 36),
                       (cx + side * (R + 24), hy + 50), (cx + side * (R + 12), hy + 50)],
                      fill=av.accent)
    if "freckles" in av.extras:
        # ON the cheeks, never across the nose. The previous placement ran -22, -12, -2, 14, 24
        # — three of those sit on or beside the nose bridge, so they joined the two blush
        # patches into ONE continuous rose band from cheek to cheek. That is the same "smooth
        # modelling" defect the client rejected, rebuilt out of freckles: the review confirmed
        # it on a tight crop.
        #
        # Now every dot is outboard of the nose and drawn in the skin's full deep tone rather
        # than mixed most of the way back to the base — a freckle has to be a step darker than
        # the blush it sits on, or it dissolves into it. Asymmetric between sides on purpose:
        # a mirrored scatter reads as a pattern, and freckles are not a pattern.
        # Tone matters as much as placement. `skin_deep` on the fair complexion came out at
        # (210,173,158) — about 30 units off her own base and LIGHTER than the blush underneath,
        # so the dots read as pale dashes laid over the cheek instead of freckles in it. Sampled
        # from the rendered PNG rather than reasoned about: the blush was (188,127,117) and the
        # freckles were sitting on top of it in a weaker colour. A freckle is darker than
        # everything around it or it is not a freckle. Darkened toward INK from the deep tone,
        # which keeps the same hue family already in her palette.
        #
        # Four, not six: at 4px on a face this size six dots per cheek pair is measles.
        # Warm brown, from the brow colour where the character has one. Mixing the deep skin
        # tone toward INK gave (153,124,111) on the fair complexion — a MAUVE, and a row of
        # mauve dots on pink cheeks reads as a rash rather than as freckles. Freckles and brows
        # are the same pigment, so borrowing the brow tone is both more accurate and free: it is
        # already in this sprite, in the bands the cheeks occupy.
        freckle = av.brow_colour or _mix(skin_deep, INK, 0.34)
        for fx, fy in ((-40, 10), (-30, 16), (34, 12), (42, 18)):
            d.rectangle((cx + hxx(fx), hy + fy, cx + hxx(fx) + 4, hy + fy + 4),
                        fill=freckle)
    if "gap_tooth" in av.extras and expression == "happy":
        # A gap in the front teeth, visible only when she grins. The one detail in this cast
        # that exists in a single expression — a child missing a tooth is a fact about her, and
        # a fact you only catch when she is pleased with herself is worth more than one that
        # sits on her face all game.
        d.rectangle((cx - 4, hy + 40, cx + 4, hy + 48), fill=skin_sh)
    if "buttons" in av.extras:
        # Down the cream placket. Off the placket's OWN deep tone rather than a wood brown: a
        # button is a small mark on a garment and it only has to be darker than the cloth it
        # sits on, so taking it from a tone already in this sprite buys the same read for no
        # colour-budget at all.
        for by_ in (sy + 108, sy + 132, sy + 156):
            d.rectangle((OPP_CX - 4, by_, OPP_CX + 4, by_ + 8), fill=ramp(av.placket)[3])
    if "pocket" in av.extras:
        # A patch pocket on the shirt, flap and all. The most ordinary object a man can have on
        # his chest, which is exactly the brief — but it is a DRAWN object with a seam and a
        # flap, so it says someone bothered. Sits on his shaded side, clear of the braces
        # (which end at hxx-independent x+50) and clear of the placket.
        pk = sy + av.shoulder_dy[1] + 16
        d.rectangle((OPP_CX + 54, pk + 96, OPP_CX + 90, pk + 100),
                    fill=ramp(av.coat)[0])
        # Seams in the coat's own HIGHLIGHT, not its deep tone: the deep tone appears nowhere
        # else in this x-band, and adding it there took him to 65 of 64. The highlight is
        # already in these bands (braces, collar), so the pocket costs nothing.
        d.rectangle((OPP_CX + 54, pk + 100, OPP_CX + 58, pk + 130),
                    fill=ramp(av.coat)[0])
        d.rectangle((OPP_CX + 86, pk + 100, OPP_CX + 90, pk + 130),
                    fill=ramp(av.coat)[0])
        d.rectangle((OPP_CX + 54, pk + 126, OPP_CX + 90, pk + 130),
                    fill=ramp(av.coat)[0])
    if "collar" in av.extras:
        # An open work-shirt collar, two flaps falling from the throat. It is what stops the
        # widest, plainest chest in the set being a slab with a dark stripe down it, and an
        # unbuttoned collar is about as "ordinary bloke at the end of a shift" as four polygons
        # get. In the coat's own highlight, which the braces already put in these bands.
        for side, sd in ((-1, av.shoulder_dy[0]), (1, av.shoulder_dy[1])):
            d.polygon([(OPP_CX + side * 8, sy + 52 + sd // 2),
                       (OPP_CX + side * 48, sy + 58 + sd),
                       (OPP_CX + side * 40, sy + 78 + sd),
                       (OPP_CX + side * 12, sy + 88 + sd // 2)], fill=ramp(av.coat)[0])
    if "braces" in av.extras:
        # Braces over the shirt: two verticals crossing the chest, which also breaks up the
        # widest torso in the set. Tan leather, not BOOT_DARK — dark straps over a dark buffalo
        # check disappeared into the plaid completely, which is a detail costing colours and
        # buying nothing. Then WOOD_LIGHT, which read fine and tripped `_assert_sprite_colours`
        # at 65 of 64 — a new base tone lands in every `light_from` band it crosses, and the
        # chest crosses several. The coat's own highlight is already present in exactly those
        # bands, so it separates from the dark check squares for free.
        for side, sd in ((-1, av.shoulder_dy[0]), (1, av.shoulder_dy[1])):
            x0, x1 = sorted((OPP_CX + side * 26, OPP_CX + side * 42))
            d.polygon([(x0, sy + 60 + sd), (x1, sy + 60 + sd),
                       (x1 + side * 8, OPP_H), (x0 + side * 8, OPP_H)], fill=ramp(av.coat)[0])

    if av.pipe:
        d.polygon([
            (cx - 46, hy + 20), (cx - 40, hy + 26),
            (cx - 58, hy + 44), (cx - 64, hy + 38),
        ], fill=INK)
        d.rectangle((cx - 72, hy + 34, cx - 56, hy + 48), fill=BOOT_DARK)


def _buffalo_check(img: Image.Image, base: tuple, alt: tuple, size: int) -> None:
    """Recolors every pixel still flat `base` into an alternating checker with `alt`, in place.

    No polygon clipping needed: `composite_sprite` already baked the chest's silhouette into
    the alpha channel, and the 2px shadow band down one edge of every part is `darken(base)`,
    not `base` — so only the flat interior gets checked, and the existing shadow band survives
    untouched as the check's border, exactly like it already was for a flat fill.
    """
    px = img.load()
    w, h = img.size
    target = base[:3]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and (r, g, b) == target and ((x // size) + (y // size)) % 2 == 0:
                px[x, y] = alt


def make_avatar(av, expression: str) -> Image.Image:
    img = Image.new("RGBA", (OPP_W, OPP_H), (0, 0, 0, 0))
    paste(img, composite_sprite(OPP_W, OPP_H, _avatar_parts(av), outline_px=4, pad=6), 0, 0)
    # Buffalo check, not a flat coat — see the FLANNEL_RED/HAT_FUR note above. The alt tone is
    # the coat's own placket colour, already in this sprite's palette, so it adds no new base.
    if av.check:
        _buffalo_check(img, av.coat, av.placket, 16)
    if "knit" in av.extras:
        # ROUND 2 MERGE, from Designer A: the same recolour trick as the buffalo check, at half
        # the block size and in the coat's OWN shadow tone rather than a second base colour, so
        # a chunky hand-knit reads as texture instead of as a second garment. This is the fix
        # for the flattest torso I shipped in round 1.
        _buffalo_check(img, av.coat, ramp(av.coat)[2], 8)
    draw_avatar_face(img, expression, av)
    # Lit from the hearth like everything else in the room (see light_from's docstring).
    return light_from(img, strength=0.14)


# --- Scoreboard cards (Phase 2e.6, pip grid corrected in 2e.7) --------------------------- #
# The real euchre 4-and-6 scoring ritual: a 4 and a 6 of a chosen suit, and the score at any
# moment is the SUM OF EXPOSED PIPS across both — you raise the 4 to show 1-4, then once it
# reads a full 4 you start raising the 6 to carry the rest, up to a full 10.
#
# **This went through two layouts.** The first used a single vertical column of pips, on the
# reasoning that a real 2-column grid can only reveal a whole row (2 pips) at a time and a
# game to 10 spends most of its life on 1-point hands. That was correct about the constraint
# and wrong about the fix: a single column of 4 or 6 identical pips stacked in a line doesn't
# read as a playing card at all, real 4s and 6s are never drawn that way, and it was reported
# back as looking wrong on sight, before any reveal math was even in question.
#
# The actual fix keeps the traditional 2-column grid (real card layout, matches the reference
# photos) and gets single-pip granularity a different way: the cover reveals in READING ORDER
# — left-to-right within a row, top row before the next — so an odd score exposes the left
# pip of a row while the right pip of that same row stays covered. `src/ui/Scoreboard.tsx`
# turns `revealed`/`rows` into a clip-path polygon that stops exactly at that boundary; the
# row geometry below (`SCORE_PIP_Y0/Y1`, two columns, `rows = count // 2`) is what the TS
# clip-path math is computed against, so the two files must be read together — same
# cross-file coupling pattern as TRICK_HOLD_MS between useGame.ts and Table.tsx.

SCORE_CARD_W, SCORE_CARD_H = 60, 84
SCORE_PIP_Y0, SCORE_PIP_Y1 = 6, 78  # pip GRID bounds — mirrored in Scoreboard.tsx
SCORE_PIP_COLS = (0.30, 0.70)       # column centres, as a fraction of card width


def _score_card_frame(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    draw.rectangle((0, 0, w - 1, h - 1), fill=PARCHMENT)
    draw.rectangle((0, 0, w - 1, h - 1), outline=INK, width=2)
    draw.rectangle((2, 2, w - 3, h - 3), outline=PARCHMENT_SHADOW)


def make_scoreboard_card(rank: str, suit: str) -> Image.Image:
    w, h = SCORE_CARD_W, SCORE_CARD_H
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    _score_card_frame(draw, w, h)

    body = body_color(suit)
    count = 4 if rank == "4" else 6
    rows = count // 2
    # Smaller pips for the 6-card's three rows than the 4-card's two — at equal row spacing,
    # three rows packed into the same band sit closer together than two do, and an unchanged
    # pip size would overlap them.
    pip_size = 12 if count == 4 else 10
    band = SCORE_PIP_Y1 - SCORE_PIP_Y0
    for row in range(rows):
        # Centre of this row's slot, top to bottom.
        fy = (SCORE_PIP_Y0 + (row + 0.5) * band / rows) / h
        for fx in SCORE_PIP_COLS:
            sprite = pip_sprite(suit, pip_size, body, outline_px=1, shade_depth=1)
            paste(card, sprite, w * fx - pip_size / 2, h * fy - pip_size / 2)

    text = text_color(suit)
    # Corners, clear of the pip grid horizontally regardless of vertical overlap. scale=2,
    # matching PX: a scale=1 glyph draws 1-screen-pixel strokes, which is exactly the detail
    # the 2x grid snap discards — it survived unnoticed while scale=1 was still legal
    # (pre-2e.1), but after the pixel-grid pass it collapsed into an unreadable smear.
    for x, y in ((2, 2), (w - 18, h - 20)):
        gdraw = ImageDraw.Draw(card)
        draw_glyph(gdraw, x, y, GLYPHS[rank], text, scale=2)

    card = snap_to_pixel_grid(card)
    _assert_pixel_grid(card, label=f"scoreboard {rank} of {suit}")
    return card


def make_suit_icon(suit: str, size=40) -> Image.Image:
    """A standalone suit pip, for the upcard reveal wheel (Phase 2e.8) — the spec calls for
    "four suits blur past and clack onto the upcard's suit", which needs a suit on its own,
    not stamped onto a full card. Reuses `pip_sprite()` exactly as the card corners do, so it
    is guaranteed to be the same shape/shading as the pip a player already reads on every
    card — no second suit-drawing code path to keep in sync."""
    sprite, _pad = pip_sprite(suit, size, body_color(suit), outline_px=2, shade_depth=2)
    sprite = snap_to_pixel_grid(sprite)
    _assert_pixel_grid(sprite, label=f"suit icon {suit}")
    return sprite


def make_app_icon(size: int) -> Image.Image:
    """PWA/favicon icon (Phase 2e.9) — a spade pip on a warm wood roundel, generated the same
    deterministic way as everything else rather than hand-drawn or AI-generated. Spades over
    the other three suits for no rules reason, purely as a single, instantly-legible mark at
    icon sizes — a full illustrated face card or the felt/cabin scene would be noise at
    48x48. Drawn at a fixed 256px working resolution and resized down, since pip_sprite's
    outline/shade math assumes real pixel counts, not icon-scale slivers.
    """
    WORK = 256
    img = Image.new("RGBA", (WORK, WORK), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((4, 4, WORK - 4, WORK - 4), fill=WOOD_DARK)
    draw.ellipse((10, 10, WORK - 10, WORK - 10), outline=GOLD, width=4)
    pip_size = 156
    pip, pad = pip_sprite("spades", pip_size, GOLD, outline_px=4, shade_depth=2)
    paste(img, (pip, pad), WORK / 2 - pip_size / 2, WORK / 2 - pip_size / 2)
    if size != WORK:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def make_gear_icon(work: int = 32) -> Image.Image:
    """The pause/settings button's gear — a brass cog in the cabin palette.

    Replaces the `⚙` Unicode glyph the button rendered before, which was the only piece of art
    in the game supplied by the system font: it changed shape per platform, drew in whatever
    weight the font felt like, ignored the palette, and read as browser chrome sitting on top
    of the game rather than as part of it.

    Transparent ground and a punched-through hub, so the button's own translucent panel and
    border show through instead of the sprite carrying a background that would double up on it.

    Drawn 8x oversize and downsampled for the same reason `make_app_icon` does it: the tooth
    polygon needs real pixel counts to come out symmetric, not icon-scale slivers. `work` is
    the pre-`save_asset` size, so the written file is `work // PX` square — 16x16 au here.

    16 au, not 32: art in this game is authored in au and displayed at `au * var(--px)`, so the
    file size IS the mobile render size and twice it is the desktop one. A 32 au gear could
    only render at 32px or 64px without breaking the whole-number-scale rule `scripts/
    scale-audit.js` enforces, and both are far too big for a corner button — the first attempt
    at that size failed the audit at every viewport by rendering at 0.475-0.575x.
    """
    SS = 8
    big = work * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    c = big / 2
    r_tip, r_root, r_hub = big * 0.46, big * 0.33, big * 0.19
    # 8 teeth phased so the first points straight UP. On a pixel grid, symmetry is what makes a
    # small sprite read as machined rather than as a blob, and 8 teeth at 45deg increments land
    # on the four axes and four diagonals — every one of them mirror-symmetric about the
    # sprite's own centre lines. 6 teeth (60deg) shares no such alignment and quantised
    # visibly lopsided at this size.
    teeth = 8
    pitch = 2 * math.pi / teeth
    # Alternating root/tip radii with FLAT tooth tops and square shoulders — a plain
    # alternating-radius star polygon reads as a sunburst; the flats are what make it machined.
    pts = []
    for i in range(teeth):
        a = i * pitch - math.pi / 2  # phase so tooth 0 points up, not right
        for offset, r in (
            (-pitch * 0.28, r_root),
            (-pitch * 0.15, r_tip),
            (+pitch * 0.15, r_tip),
            (+pitch * 0.28, r_root),
        ):
            pts.append((c + math.cos(a + offset) * r, c + math.sin(a + offset) * r))
    # Sized against the FINAL file, not the working canvas: the sprite is downsampled by SS
    # here and halved again by save_asset, so a stroke picked to look right at `big` lands at
    # a sixteenth of that on disk. big//16 leaves a real ~2px outline in the written 32px
    # sprite; the first attempt (big//44) rendered to under a pixel and disappeared entirely.
    stroke = max(2, big // 16)
    draw.polygon(pts, fill=GOLD)
    # ImageDraw's `outline=` is 1px whatever the scale, which disappears entirely in the
    # downsample — the outline has to be a real stroked line at this working size.
    draw.line(pts + [pts[0]], fill=INK, width=stroke, joint="curve")
    hub = (c - r_hub, c - r_hub, c + r_hub, c + r_hub)
    # Raw value write, not a composite — this punches the hub clear rather than tinting it.
    draw.ellipse(hub, fill=(0, 0, 0, 0))
    draw.ellipse(hub, outline=INK, width=stroke)
    small = img.resize((work, work), Image.LANCZOS)
    # Hard-quantise to the sprite's three real values. Downsampling curved geometry this far
    # leaves a haze of blended in-between tones, and at 16 au that haze is most of the image —
    # it reads as a smudge rather than as pixel art, and `save_asset`'s grid snap keeps the
    # blend rather than cleaning it. Everything else in this file is drawn at final resolution
    # from straight edges and never needs this; the gear is the one curved sprite that does.
    px = small.load()
    for y in range(work):
        for x in range(work):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            d_gold = (r - GOLD[0]) ** 2 + (g - GOLD[1]) ** 2 + (b - GOLD[2]) ** 2
            d_ink = (r - INK[0]) ** 2 + (g - INK[1]) ** 2 + (b - INK[2]) ** 2
            px[x, y] = GOLD if d_gold <= d_ink else INK
    return small


def make_dealer_chip(work: int = 40) -> Image.Image:
    """A small wooden token marking whose deal it is (2o.2) — direct user feedback: "i think we
    need a dealer chip on the table to show players who was the dealer." Real euchre uses
    whatever is at hand for this (a coin, a button); this room already has a woodworking
    palette (WOOD_DARK/MED/LIGHT, the shelf, the table legs) rather than a card-suit motif, so a
    carved wooden disc reads as furniture from THIS cabin rather than a poker-night prop
    borrowed from a different game.

    Same 8x-supersample-then-hard-quantise technique as `make_gear_icon`, for the same reason:
    a circle drawn straight at final size leaves a blended haze at the rim that reads as a
    smudge, not a coin. Quantises to THREE colours here (INK rim, WOOD_MED face, WOOD_LIGHT
    groove), not the gear's two, for the same bevelled-coin look real wooden tokens have.

    `work` is the PRE-`save_asset` size like every other sprite in this file (`save_asset`
    halves it by PX=2), so 40 here is 20 au on disk — bigger than the gear's 16 au: a table
    prop has to compete with actual cards on the felt, not sit quietly in a corner button, so
    it needs to read from across a much bigger box. Still a whole 8/16/20/40-style number so
    `scripts/scale-audit.js`'s whole-pixel-scale rule holds at every `--px`.
    """
    SS = 8
    big = work * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    c = big / 2
    r_outer, r_inner = big * 0.47, big * 0.40
    stroke = max(2, big // 16)
    # The disc itself: a dark rim (INK) around a lighter wood face (WOOD_MED), same two-tone
    # coin construction real wooden tokens use so the edge reads as a bevel, not a flat sticker.
    draw.ellipse((c - r_outer, c - r_outer, c + r_outer, c + r_outer), fill=INK)
    draw.ellipse((c - r_inner, c - r_inner, c + r_inner, c + r_inner), fill=WOOD_MED)
    # A thin inner ring, WOOD_LIGHT, for the carved-groove look the shelf's own edge trim uses.
    r_ring = big * 0.32
    draw.ellipse(
        (c - r_ring, c - r_ring, c + r_ring, c + r_ring), outline=WOOD_LIGHT, width=stroke
    )
    small = img.resize((work, work), Image.LANCZOS)
    # Hard-quantise to the disc's four real values — see make_gear_icon's own comment for why
    # this step exists at all (a LANCZOS downsample of curved geometry leaves blended
    # in-between tones that are most of the image at this size).
    palette = [INK, WOOD_MED, WOOD_LIGHT]
    px = small.load()
    for y in range(work):
        for x in range(work):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            best = min(palette, key=lambda col: (r - col[0]) ** 2 + (g - col[1]) ** 2 + (b - col[2]) ** 2)
            px[x, y] = best
    # The 'D' glyph, drawn AFTER quantising and at final resolution (unlike the disc, it's
    # already straight-edged, so it doesn't need the supersample pass) — centred by eye against
    # the glyph's own 5x7 cell at GLYPH_SCALE 1 (the disc is only 20px across; GLYPH_SCALE 2's
    # 10px-wide letter would run past the inner ring).
    fdraw = ImageDraw.Draw(small)
    glyph_w, glyph_h = 5 * 2, 7 * 2  # GLYPHS cells are 5x7, drawn here at scale=2
    draw_glyph(fdraw, (work - glyph_w) // 2, (work - glyph_h) // 2, GLYPHS["D"], GOLD, scale=2)
    return small


def make_card_back(w: int = CARD_W, h: int = CARD_H, step: int = 14) -> Image.Image:
    """The card back, drawable at any size.

    Sized because a *smaller* card needs *redrawn* art, not the same art squashed. The
    scoreboard's cover card is 30x42 au against the deck's 50x70; stretching the deck's back
    over it was rendering at 1.2x, which is exactly the kind of fractional scale this phase
    exists to eliminate. `step` scales with the card so the quilt blocks keep their density
    instead of turning into two big squares on the small one.

    Quilted patchwork, not a diamond lattice: each block gets a stitched square outline plus
    a cross-stitch through its centre, which reads as sewn fabric squares rather than a repeat
    of hollow diamonds — the "held deck sitting on the table" read the redesign is going for.
    """
    img = Image.new("RGBA", (w, h), WOOD_DARK)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, w - 1, h - 1), outline=(0, 0, 0, 255), width=2)

    for y in range(-step, h + step, step):
        for x in range(-step, w + step, step):
            draw.rectangle((x, y, x + step, y + step), outline=WOOD_LIGHT)
            draw.line((x, y, x + step, y + step), fill=WOOD_MED)
            draw.line((x + step, y, x, y + step), fill=WOOD_MED)
            draw.point((x + step // 2, y + step // 2), fill=GOLD)

    inset = 7 if w >= CARD_W else 4
    draw.rectangle((inset, inset, w - inset - 1, h - inset - 1), outline=GOLD, width=2)
    img = snap_to_pixel_grid(img)
    _assert_pixel_grid(img, label=f"card back {w}x{h}")
    return img


def make_table_felt() -> Image.Image:
    """Table surface — a woven gingham tablecloth. **The calmest surface in the room.**

    Replaces the earlier wood-plank material (despite the function's name, it drew planks, not
    cloth) — a farmhouse table is laid with a cloth, not bare board. The "calm centre" rules
    that shaped the plank tile are kept exactly, because they were never about wood, they were
    about this tile's job — it sits directly under the cards and must not compete with them:

      1. **No point features.** Distinctive one-off marks belong in the scene layer as placed
         decals, never in a repeating tile — they read as an unmistakable dot grid at repeat.
      2. **Rich periphery, calm centre.** The check pattern is large and low-contrast, not a
         busy print; the weave texture on top of it is pulled almost to base.
      3. **Tone stays close.** High contrast between check squares reads as a loud pattern
         competing with the cards, not as one calm cloth. The crown/weave carries what little
         local contrast this tile has, per the same 2g.1 "calm is not the same as flat" lesson
         the plank tile learned — fully flat colour looks like dithered noise up close, so a
         small amount of tonal range stays, just not spent on the checks themselves.
    """
    size = 128
    hi, base, sh, deep = ramp(TABLE_WOOD)

    img = Image.new("RGBA", (size, size), base)
    draw = ImageDraw.Draw(img)

    # Gingham check: alternating light/dark bands in both axes, overlapping bands darkening
    # further where they cross — the classic woven-check look, kept deliberately low-contrast.
    check = 32
    light = _mix(base, hi, 0.16)
    dark = _mix(base, sh, 0.20)

    for y in range(size):
        band_y = (y // check) % 2 == 0
        for x0 in range(0, size, check):
            band_x = (x0 // check) % 2 == 0
            if band_x and band_y:
                tone = dark
            elif band_x or band_y:
                tone = light
            else:
                tone = base
            draw.line((x0, y, x0 + check - 1, y), fill=tone)

    # Woven texture on top of the check, quiet dashes in both directions so it reads as cloth
    # rather than as flat printed fill. Fixed arithmetic, never `random`, byte-reproducible.
    for y in range(0, size, 3):
        seed = y * 7 + 5
        x = (seed * 5) % 11
        while x < size:
            run = 6 + (seed % 9)
            draw.line((x, y, min(x + run, size - 1), y),
                      fill=_mix(img.getpixel((x, y))[:3] + (255,), hi if (seed // 3) % 2 else sh, 0.05))
            x += run + 6 + (seed % 5)
            seed += 7

    for x in range(0, size, 3):
        seed = x * 11 + 3
        y = (seed * 5) % 11
        while y < size:
            run = 6 + (seed % 9)
            for yy in range(y, min(y + run, size - 1) + 1):
                draw.point((x, yy),
                           fill=_mix(img.getpixel((x, yy))[:3] + (255,), sh if (seed // 3) % 2 else hi, 0.05))
            y += run + 7 + (seed % 5)
            seed += 9

    # A soft seam line every two checks, standing in for a runner/hem crease rather than a
    # plank joint — subtle, never brighter than the check contrast itself.
    for py in range(0, size, check * 2):
        draw.line((0, py, size - 1, py), fill=_mix(base, deep, 0.12))

    return img


def make_wall_texture() -> Image.Image:
    """Farmhouse wall — flat board-and-batten paneling: wide flat vertical boards with a
    narrow raised batten strip covering each seam.

    Replaces the earlier log-cabin material (stacked cylindrical logs) which, however well
    the tiling artifacts were solved, was structurally a log cabin rather than a farmhouse —
    a material problem, not a shading problem, so the fix is a different material rather than
    a different treatment of the same one.

    The hard-won tiling lessons from the log wall still apply and are kept:
      - **No point features** (knots, nails) — they become a polka-dot grid at repeat.
      - **No hard uniform edge as the sole period.** The old wall failed as "venetian blinds"
        when its band boundaries were thin bright rules; here the boards are flat (no per-log
        cylinder falloff to reintroduce that problem) and the seams are batten strips with
        soft flanking shadow, not single bright/dark lines.
      - **Stay compressed toward base** via `_mix()`. This is a backdrop; it must recede
        behind the table rather than compete with the cards.

    Deliberately near-flat per §"model the material, don't decorate the tile": board-and-batten
    IS flat panels, so there is no cylindrical shading to add. Only a very gentle top-lit
    vertical falloff per board (for a hint of form) plus the raised batten strips.
    """
    size = 128
    hi_f, base, sh_f, deep_f = ramp(WALL_WOOD)
    hi = _mix(base, hi_f, 0.5)
    sh = _mix(base, sh_f, 0.55)
    deep = _mix(base, deep_f, 0.7)

    img = Image.new("RGBA", (size, size), base)
    draw = ImageDraw.Draw(img)

    # Unequal widths summing to `size` so the wall has no single repeat frequency.
    board_w = (34, 30, 32, 32)
    batten_w = 6
    board_tint = (0.00, 0.06, -0.05, 0.03)

    bx = 0
    for board, w in enumerate(board_w):
        tint = board_tint[board % len(board_tint)]
        b_base = _mix(base, hi if tint >= 0 else sh, abs(tint))

        # Very gentle top-lit falloff — flat paneling, not a log, so this stays subtle: a
        # whisper of form rather than a gradient anyone would consciously notice.
        for dy in range(size):
            frac = dy / (size - 1)
            tone = _mix(b_base, hi, 0.10 * (1 - frac)) if frac < 0.5 else \
                _mix(b_base, sh, 0.10 * (frac - 0.5) / 0.5)
            draw.line((bx, dy, bx + w - 1, dy), fill=tone)

        # Quiet vertical grain, running WITH the board (unlike the old horizontal log grain),
        # low-contrast dashes so it reads as figure rather than scratches. Fixed arithmetic.
        seed = board * 13 + 5
        for gx in range(2, w - 2, 5):
            y = (seed * 5) % 17
            while y < size:
                run = 10 + (seed % 16)
                streak = _mix(b_base, sh if (seed // 3) % 2 else hi, 0.06)
                draw.line((bx + gx, y, bx + gx, min(y + run, size - 1)), fill=streak)
                y += run + 8 + (seed % 6)
                seed += 7

        bx += w

    # Battens: a raised strip nailed over each board seam. Modelled as a soft shadow on the
    # left, a lit face, and a soft shadow on the right — three narrow flat bands, not a single
    # bright/dark rule, so no one hard edge becomes the tile's visible period.
    seam_x = 0
    for w in board_w:
        seam_x += w
        cx = seam_x % size
        if cx == 0:
            continue
        half = batten_w // 2
        for dx in range(-half, half + 1):
            x = (cx + dx) % size
            if dx <= -half:
                tone = deep
            elif dx >= half:
                tone = _mix(deep, sh, 0.4)
            else:
                tone = _mix(hi, base, 0.25)
            draw.line((x, 0, x, size - 1), fill=tone)
    return img


def _flame(draw, cx, base_y, w, h, sway, color, phase):
    """One flame tongue as a polygon, with a slight lateral wobble.

    The width profile is `1 - t**1.6`, which stays broad through the lower half before
    falling away — a plain `(1-t)**1.45` taper starts narrowing immediately from the base
    and reads as a cone/party-hat rather than as fire. Frame-to-frame variation comes only
    from `phase` and `sway`, so the shape family stays consistent while the silhouette
    moves; animating by swapping unrelated blobs reads as noise, not flame."""
    steps = 10
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        half = (w / 2) * (1 - t ** 1.6)
        drift = sway * t + math.sin(t * 3.4 + phase) * w * 0.08
        y = base_y - h * t
        left.append((cx + drift - half, y))
        right.append((cx + drift + half, y))
    draw.polygon(left + right[::-1], fill=color)


def make_fire_frames(count=4, w=272, h=168):
    """Animation frames for the hearth fire. Deterministic: each frame is a pure function of
    its index, no randomness, so regeneration is byte-identical.

    **Height and sway are driven by sin and cos respectively, not both by sin.** With both on
    `sin(phase)` and four frames, phases 0 and pi both give sin = 0, so frames 0 and 2 came out
    with identical height *and* sway — 4 frames but only 3 distinct outer silhouettes, and the
    loop read as a shape pumping between two states rather than as fire. Using sin for one
    dimension and cos for the other makes the pair trace a circle, so every sample is distinct.
    Sampling a single sinusoid at multiples of pi is the general trap here.

    **Sized to actually fill the hearth (Phase 2g.3), and parametric so it stays that way.**
    2f.4 scaled the fireplace 2.2x and moved this flame into the new opening WITHOUT resizing
    it, noting the debt honestly at the time. The result measured 34x30 au inside a 75x87 au
    firebox — 45% of its width and 34% of its height, a pilot light in a cathedral hearth.
    That matters more than any other single object here, because in a game whose stated mood
    is "cabin by the fire" this is the literal source of the warmth.

    Every constant below is now a FRACTION of `w`/`h` rather than a pixel count, which is why
    the resize was a two-number change. The previous magic numbers were tuned for 68x60 and
    silently became wrong the moment the hearth around them grew.
    """
    frames = []
    for i in range(count):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        phase = 2 * math.pi * i / count
        sin_p, cos_p = math.sin(phase), math.cos(phase)
        cx, base = w / 2, h - round(h * 0.11)

        log_h = max(4, round(h * 0.055))
        for lx_f, ly_f, lw_f in ((0.13, 0.03, 0.34), (0.43, 0.05, 0.37), (0.28, 0.0, 0.31)):
            lx, ly, lw = round(w * lx_f), round(h * ly_f), round(w * lw_f)
            d.rectangle((lx, base + ly - log_h, lx + lw, base + ly), fill=darken(WOOD_MED, 0.7))
            d.rectangle((lx, base + ly - log_h, lx + lw, base + ly - log_h + 1), fill=EMBER)

        _flame(d, cx, base, w * 0.53, h * 0.55 + h * 0.10 * sin_p, w * 0.05 * cos_p,
               FIRE_DEEP, phase)
        _flame(d, cx, base, w * 0.37, h * 0.41 + h * 0.085 * cos_p, w * 0.037 * sin_p,
               FIRE_MID, phase + 1.1)
        _flame(d, cx, base, w * 0.19, h * 0.26 + h * 0.068 * sin_p, w * 0.022 * cos_p,
               FIRE_CORE, phase + 2.2)

        spark_travel = round(h * 0.24)
        for k, (ex_f, ey_f) in enumerate(((0.24, 0.38), (0.62, 0.48), (0.44, 0.28))):
            off = (i * 4 + k * 3) % spark_travel
            d.point((round(w * ex_f) + (k % 2), base - round(h * ey_f) - off),
                    fill=FIRE_CORE if off < spark_travel // 2 else FIRE_MID)
        frames.append(img)
    return frames


def make_fireplace(w=748, h=540):
    """Stone hearth surround with a firebox opening and a timber mantel.

    **Sized from the table as ruler (Phase 2j.3), and every constant below is now a FRACTION
    of w/h rather than a pixel count.** The felt is a fixed 280 au and a real card table is
    about 90cm, which fixes the room's scale at roughly 1 au = 3.2mm. A hearth surround of
    ~120cm wide is therefore ~374 au, and this canvas is exactly that, doubled (au = canvas/2).

    **HEIGHT is capped by the frame, not by the ruler, and that is a deliberate compromise.**
    A physically-correct 150cm surround would be 468 au, but the wall band between the floor
    line and the top of the viewport measures only 284 au at desktop — so a realistic hearth
    literally cannot fit, and at 468 au it rendered with its top at y=-362, cropping the mantel
    off the screen entirely. Cropping a hearth is fine; cropping away the mantel is not, since
    that is the feature that makes it read as a hearth at all. 270 au keeps the correct WIDTH
    (the more legible dimension) and yields a wide, low inglenook, which is characterful rather
    than merely compromised. The real fix is a camera that shows more wall, which is 2j.4's
    job — noted here so the number is understood as frame-bound, not as the ruler's answer.

    That supersedes 2f.4's "2.2x, stylised not physical" reasoning, which was calibrated
    against the opponent on the assumption he was also stylised. Measuring both against the
    table showed otherwise: at 150 au wide his shoulders are ~48cm, which is simply CORRECT.
    So the person was never the stylised one — the room was uniformly ~2.4x too small around
    him, which is exactly why it read as miniatures on a shelf rather than somewhere you sit.
    Sizing each object from the ruler instead of from a blanket multiplier matters here
    specifically because the error was NOT uniform: hearth-to-shoulders should be ~2.5 and was
    1.03, so scaling everything equally would have preserved that wrongness.

    Proportional constants are not cosmetic tidiness. The previous version hardcoded
    `course_h`, stone width and the firebox inset in pixels, so growing the canvas would have
    stacked 2.4x as many identical-sized stones instead of reading as bigger stone on a bigger
    wall — the exact failure this function's own docstring warned about, and the same trap the
    fire frames hit in 2g.3.

    Two things this gets wrong if done naively, both fixed here:

    - **Stone wants a compressed ramp.** ramp() applies a deliberate warm/cool temperature
      shift, which is right for wood but turns stone into a patchwork of blue-grey and khaki
      blocks. Stone is close to neutral, so each course tone is pulled back toward base with
      _mix(). This is the same compression the wall backdrop uses, for a different reason:
      there to recede, here to stay believably one material.
    - **Masonry needs mortar.** Abutting coloured rectangles read as a colour-blocked grid,
      not as stacked stone. Drawing a mortar-coloured ground first and insetting every stone
      by a pixel leaves visible joints, which is what actually sells it as masonry.

    Unlike the tiled wall, this is a placed one-off object, so per-stone variation is fine —
    it never repeats.
    """
    hi, base, sh, deep = ramp(STONE_MED)
    # Neutralise stone: keep some tonal life, drop most of the temperature swing.
    hi = _mix(base, hi, 0.4)
    sh = _mix(base, sh, 0.4)
    mortar = _mix(base, STONE_DARK, 0.7)

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def _solid_line(x0, y0, x1, y1, fill, lw):
        # d.line(..., width=N) on a shallow diagonal rasterizes with visible gaps/stairstepping
        # instead of a solid stroke (PIL quirk). Drawing the thick line as a filled quad instead
        # (the two endpoints offset perpendicular to the line direction by half the width) is
        # solid at any angle -- AT THE RAW CANVAS RESOLUTION. It is not enough on its own: every
        # asset in this file is snapped to a `PX*CHUNK_ENV` (2*2=4 canvas-px) grid by
        # `save_asset()` before being halved to true resolution. A diagonal quad NARROWER than
        # that grid cell still comes out dashed after the snap, because its coverage of each
        # 4x4 cell alternates between "mostly in" and "barely in" as it walks along the
        # diagonal -- the exact same visual defect as the original `d.line()` bug, just moved
        # one step downstream. Caught by re-inspecting the actual SAVED PNG, not the pre-snap
        # canvas, which is what let this slip through the first time. `lw` is clamped to at
        # least 1.6x the grid size so the quad can never fully vanish between snapped cells.
        lw = max(lw, PX * CHUNK_ENV * 1.6)
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1
        nx, ny = -dy / length * lw / 2, dx / length * lw / 2
        d.polygon([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny),
                   (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], fill=fill)

    body_top = round(h * 0.117)
    d.rectangle((0, body_top, w - 1, h - 1), fill=mortar)

    # Course height and stone width are FRACTIONS of the fireplace, so a resize gives bigger
    # stone rather than more of it.
    course_h = round(h * 0.0898)
    stone_pad = max(2, round(w * 0.0065))
    seed = 5
    row = 0
    y = body_top
    while y < h:
        x = -((row % 3) * round(w * 0.078))
        while x < w:
            sw = round(w * 0.136) + (seed % round(w * 0.107))
            tone = (base, hi, sh, base)[(seed // 3) % 4]
            # Clamp AND check: a course landing near the bottom edge can clamp y1 below y0,
            # which PIL rejects outright ("x1 must be greater than or equal to x0").
            x0, y0 = x + stone_pad, y + stone_pad
            x1, y1 = min(x + sw - stone_pad * 2, w - 1), min(y + course_h - stone_pad * 3, h - 1)
            if x1 >= x0 and y1 >= y0:
                # Firelight falloff: the hearth emits light into the room, so its own stones
                # must be lit by it too. Without this the object throwing the glow is itself
                # uniformly lit, which quietly breaks the illusion.
                mid_x, mid_y = (x0 + x1) / 2, (y0 + y1) / 2
                dist = math.hypot(mid_x - w / 2, mid_y - h * 0.704) / (h * 0.583)
                tone = _mix(tone, FIRE_DEEP, max(0.0, 0.30 - dist * 0.30))
                d.rectangle((x0, y0, x1, y1), fill=tone)
                d.line((x0, y0, x1, y0), fill=_mix(tone, hi, 0.5))      # lit top edge
                d.line((x0, y1, x1, y1), fill=_mix(tone, deep, 0.45))   # shadowed underside
            x += sw
            seed = (seed * 7 + 13) % 101
        y += course_h
        row += 1

    # Firebox, carved after the stonework so it reads as cut into the masonry. Not pure
    # black: a warm ember tone at the floor of the opening, so the recess reads as lit from
    # within rather than as a hole punched in the wall.
    ox0, ox1 = round(w * 0.2565), w - round(w * 0.2565)
    oy0, oy1 = round(h * 0.524), h - round(h * 0.0534)
    lip = max(2, round(w * 0.013))
    d.rectangle((ox0, oy0, ox1, oy1), fill=(22, 15, 14, 255))
    band_h = max(3, round(h * 0.017))
    band_step = max(4, round(h * 0.0218))
    for i, band in enumerate(range(oy1 - round(h * 0.097), oy1, band_step)):
        d.rectangle((ox0 + lip, band, ox1 - lip, band + band_h),
                    fill=_mix((22, 15, 14, 255), EMBER, 0.18 + i * 0.14))

    # Ash/ember bed (wave-2): a low mound of warm grey-white ash along the firebox floor, in
    # front of/around where the flame sprite sits (a separate DOM overlay, .scene-fire in
    # SceneLayer.tsx, positioned inside this same opening). A dedicated cool-ish ramp off
    # PARCHMENT mixed toward the (already-neutralised) stone tone, pulled back toward its own
    # base the same way the masonry above is, so it reads as chalky ash rather than warm wood.
    # Drawn BEFORE the lip outline below so the border redraws cleanly over the mound's edges,
    # and low/flat by design -- ash underfoot, not a shape competing with the flame.
    ash_hi, ash_base, ash_sh, _ = ramp(_mix(PARCHMENT, STONE_MED, 0.55))
    ash_hi = _mix(ash_base, ash_hi, 0.45)
    ash_sh = _mix(ash_base, ash_sh, 0.45)
    ash_y = oy1 - lip - 3
    ash_h = max(4, round(h * 0.028))
    inner_l, inner_r = ox0 + lip * 2, ox1 - lip * 2
    d.ellipse((inner_l, ash_y - ash_h, inner_r, ash_y + ash_h), fill=ash_sh)  # shadowed base
    for frac_x, frac_w, dy, tone in (
        (0.05, 0.30, 0, ash_base), (0.32, 0.28, -2, ash_hi),
        (0.55, 0.30, 1, ash_base), (0.78, 0.24, -1, ash_sh),
    ):
        cx = inner_l + round((inner_r - inner_l) * frac_x)
        cw = round((inner_r - inner_l) * frac_w)
        d.ellipse((cx, ash_y - ash_h + dy, cx + cw, ash_y + ash_h + dy), fill=tone)

    d.rectangle((ox0, oy0, ox1, oy1), outline=_mix(mortar, deep, 0.6), width=lip)
    d.line((ox0 + lip, oy0 + lip, ox1 - lip, oy0 + lip), fill=_mix(deep, FIRE_DEEP, 0.45))

    # A few small embers glowing in the ash (wave-3), earning the "ember" half of this bed's
    # own name -- it was pure grey-white ash with none. Radius-3 dots, the same minimum-size
    # point feature `make_feed_dots()` already validated against this same PX*chunk=4 authoring
    # grid (smaller collapses to noise once snapped/halved). Warm-orange EMBER/FIRE_DEEP tones,
    # kept few and low in the mound so they read as a couple of live coals underfoot rather than
    # competing with the actual flame sprite (.scene-fire) positioned in this same opening.
    # Drawn AFTER the border outline above (not before, like the ash mound itself): the outline
    # is stroked `lip`-wide inward from the opening's edges, which silently ate an ember placed
    # near the mound's bottom on the first pass (caught by inspecting the actual saved PNG, not
    # a pre-snap render -- see the lesson at the top of this task).
    for frac_x, frac_y, tone in (
        (0.16, 0.25, EMBER), (0.47, -0.35, _mix(EMBER, FIRE_DEEP, 0.5)), (0.74, 0.15, EMBER),
    ):
        ex = inner_l + round((inner_r - inner_l) * frac_x)
        ey = ash_y + round(ash_h * frac_y)
        d.ellipse((ex - 3, ey - 3, ex + 3, ey + 3), fill=tone)

    # Soft soot smudge directly above the opening — a low-alpha dark band implying years of
    # smoke staining. Drawn on a transparent overlay and alpha-composited, the same pattern
    # make_window_glass uses for its warm edge wash, rather than fighting ImageDraw's flat
    # (non-blending) fills on an RGBA canvas.
    soot = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(soot)
    soot_h = round(h * 0.09)
    soot_top = oy0 - lip - soot_h
    for i in range(soot_h):
        frac = i / soot_h  # 0 at the top (faint) -> 1 right above the opening (darkest)
        inset = round((1 - frac) * (ox1 - ox0) * 0.12)
        sd.line((ox0 + inset, soot_top + i, ox1 - inset, soot_top + i),
                fill=(*INK[:3], int(46 * frac)))  # tops out ~18% opacity, per spec
    img.alpha_composite(soot)

    # Fire irons — poker and tongs, leaning against the stone to the left of the opening. Two
    # thin angled lines, each ending in a small ellipse-outline handle loop where it meets the
    # wall.
    iron_by = oy1 - round(h * 0.01)
    iron_ty = oy0 + round(h * 0.10)
    iron_w = max(2, round(w * 0.0045))
    for bx, lean, tone in ((ox0 - round(w * 0.025), -round(w * 0.06), STEEL),
                            (ox0 - round(w * 0.025) - 10, -round(w * 0.025), darken(STEEL))):
        tx = bx + lean
        _solid_line(bx, iron_by, tx, iron_ty, tone, iron_w)
        d.ellipse((tx - 5, iron_ty - 9, tx + 5, iron_ty + 1), outline=tone, width=2)

    # Bundled kindling — thinner, fanned sticks in the hearth's corner opposite the irons
    # (right of the opening), with one darker band suggesting twine wrapped around the bundle.
    # Distinct from the round split logs of make_woodpile(): thin fanned sticks, not stacked
    # cylinders.
    kx = ox1 + round(w * 0.04)
    kbase_y = oy1 - round(h * 0.01)
    ktop_y = kbase_y - round(h * 0.09)
    for spread in (-18, -9, 0, 9, 18):
        _solid_line(kx, kbase_y, kx + spread, ktop_y, WOOD_MED, 2)
    d.line((kx - 15, kbase_y - round(h * 0.045), kx + 15, kbase_y - round(h * 0.045)),
           fill=darken(WOOD_MED), width=3)

    # Timber mantel, overhanging the stone on both sides.
    #
    # Anchored to the FIREBOX (soot_top), not to body_top, which is the real fix for "mantle is
    # still not covering fireplace" (direct user feedback). body_top sits only 5px below canvas
    # y=0, so the old `body_top - mantel .. body_top + m_lip` placement put the whole mantel
    # right at the top of the frame -- 208 canvas-px (38% of h) of plain brick then separated
    # its underside from the firebox opening at oy0, so the two never read as one structure: a
    # shelf on a tall chimney, not a mantel over a hearth. Tying the mantel's underside to
    # soot_top instead (already computed above, right where the soot smudge begins) removes
    # that dead brick entirely -- the mantel now caps the sooty band that sits directly on top
    # of the firebox, with the stone ABOVE it reading as the chimney breast rather than as
    # wasted space between two unrelated features.
    m_hi, m_base, m_sh, m_deep = ramp(TABLE_WOOD)
    mantel = round(h * 0.107)
    m_lip = max(2, round(h * 0.022))
    mantel_ref_y = soot_top - m_lip
    d.rectangle((0, mantel_ref_y - mantel, w - 1, mantel_ref_y + m_lip), fill=m_base)
    d.rectangle((0, mantel_ref_y - mantel, w - 1, mantel_ref_y - mantel + m_lip * 2), fill=m_hi)
    d.line((0, mantel_ref_y - m_lip, w - 1, mantel_ref_y - m_lip), fill=m_sh)
    d.line((0, mantel_ref_y + m_lip, w - 1, mantel_ref_y + m_lip), fill=m_deep)

    # Mantel-top clutter: a candle in a holder and a small framed tin, both sitting on the
    # mantel's lit top edge. Reuses the mantel's own m_sh/m_deep/m_base tones rather than
    # introducing new base colours — darker than the m_hi strip they sit on, so they read as
    # silhouettes against it instead of disappearing into their own background.
    ledge_y = mantel_ref_y - mantel + m_lip * 2  # bottom of the lit top-edge strip
    # .scene-fireplace crops the leftmost 78au (156 canvas-px at this w) off-screen (see
    # src/styles/index.css, ~L356). At 0.15w the candle sat at canvas-x~112, entirely inside
    # that band and permanently invisible. 0.24w (~180) clears it with margin, and stays well
    # left of the tin at frm_x=0.30w below.
    cndl_x = round(w * 0.24)
    holder_h = max(4, round(h * 0.007))
    stem_h = max(10, round(h * 0.020))
    d.rectangle((cndl_x - 6, ledge_y - holder_h, cndl_x + 6, ledge_y), fill=m_deep)
    d.rectangle((cndl_x - 3, ledge_y - holder_h - stem_h, cndl_x + 3, ledge_y - holder_h),
                fill=m_sh)
    d.ellipse((cndl_x - 4, ledge_y - holder_h - stem_h - 7, cndl_x + 4,
               ledge_y - holder_h - stem_h + 1), fill=FIRE_CORE)

    frm_x = round(w * 0.30)
    frm_w, frm_h = max(16, round(w * 0.022)), max(12, round(h * 0.020))
    d.rectangle((frm_x - frm_w // 2, ledge_y - frm_h, frm_x + frm_w // 2, ledge_y), fill=m_base)
    d.rectangle((frm_x - frm_w // 2 + 2, ledge_y - frm_h + 2, frm_x + frm_w // 2 - 2,
                 ledge_y - 2), fill=m_sh)

    # A small stack of books (wave-2), tucked into the gap between the candle and the tin —
    # measured against both: the candle's holder ends at cndl_x+6, the tin's frame starts at
    # frm_x-frm_w//2, leaving a real but narrow strip of ledge between them.
    # Was three 3px-wide spines with 1px gaps -- confirmed illegible, blurring into a smear at
    # both raw-asset zoom and in actual gameplay at 1440x900 and 768x1024. Two fatter spines
    # instead, and one given a distinct hue (CLOTH_BLUE, the same distinguishing-hue trick the
    # shelf's own leaning books already use in make_shelf()) so the pair reads as a small stack
    # rather than one blob.
    book_w, book_gap = max(6, round(w * 0.014)), max(1, round(w * 0.0027))
    book_x = cndl_x + 6 + max(3, round(w * 0.005))
    for i, (bh, tone) in enumerate((
        (max(9, round(h * 0.025)), m_deep),
        (max(6, round(h * 0.017)), _mix(CLOTH_BLUE, m_sh, 0.5)),
    )):
        bx0 = book_x + i * (book_w + book_gap)
        d.rectangle((bx0, ledge_y - bh, bx0 + book_w, ledge_y), fill=tone)
    return img


def make_chimney_tile(w=748, h=540):
    """A seamlessly-repeating vertical strip of the fireplace's own masonry, for
    `.scene-fireplace-chimney` (index.css) to tile upward to the ceiling at any viewport
    height. Direct user feedback on the first version of that fix, which used a single flat
    sampled colour instead of this: "the extension of the fireplace looks like shit and isnt
    even an extension" — correctly; a flat fill has no coursing, no mortar joints, nothing
    that reads as the SAME wall continuing, only a colour-matched rectangle glued above it.

    Crops two real courses (one full running-bond period — row 2 is offset from row 1, so a
    single course would repeat with every joint in the same place, which is what real
    brickwork never does) directly from `make_fireplace()`'s own raw output, y=64 to y=152 —
    the band between the surround's real top edge (y=64: the first 64px is the sprite's own
    transparent canvas padding, `.scene-fireplace-chimney`'s CSS comment cites this same
    number) and where the mantel begins (y=152), so nothing here is redrawn or approximated;
    it is the wall, read again. Verified seamless by tiling it 6x before shipping this, not
    assumed — running-bond coursing is exactly the kind of pattern that looks fine drawn once
    and reveals a misaligned joint the moment it actually repeats.
    """
    fireplace = make_fireplace(w, h)
    return fireplace.crop((0, 64, w, 152))


# Sized from the table as ruler (2j.3): a ~100cm-wide window at ~1 au = 3.2mm is ~312 au, and
# au = canvas/2. Supersedes 2f.4's stylised 2.2x — see make_fireplace's docstring for why the
# room, not the person, turned out to be the thing that was mis-scaled.
#
# Height is capped by the same wall band the hearth is (284 au at desktop), for the same
# reason and with the same compromise: at a realistic 374 au this rendered from y=86 down to
# y=834, hanging a quarter of its height BELOW the floor line and into the room, which reads
# as a window resting on the floorboards rather than set into the wall. 220 au keeps the
# correct width and fits the band as a wide casement.
#
# 170x120 (2k.1): the physically-derived size above is still what put the "large, deliberately
# cropped mass" philosophy at odds with a *small cabin room* — a real-scale window read as a
# second wall-sized object next to the hearth, which is exactly the "furniture that ate the
# wall" complaint this pass exists to fix. Direct user feedback, not a re-measurement: the
# room needs to read as furnished, not as objects at true architectural scale. Shrunk ~66% of
# the prior 258x182 (which was itself only a partial de-emphasis pass, per the comment above).
WINDOW_W, WINDOW_H = 340, 240


def make_window_glass(w=WINDOW_W, h=WINDOW_H):
    """The view through the window — the room's COOL reference.

    Everything else in this scene is hearth-lit and ramped warm. Without something genuinely
    cold in frame, "warm" has no counterpart and the room just reads brown — that was the
    original diagnosis behind this whole phase. So the glass, moon and frost are all built
    with `ramp(..., warm=False)`. This is the one object that must not be firelit.

    Split from the sash (make_window_frame) on purpose: snow has to fall BEHIND the glazing
    bars to look like weather outside rather than static on the lens, which means glass,
    snow and bars have to be three separate layers the DOM can stack.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    g_hi, g_base, g_sh, g_deep = ramp(NIGHT_BLUE_DEEP, warm=False)

    d.rectangle((0, 0, w - 1, h - 1), fill=g_base)
    for i, y in enumerate(range(0, h, 6)):
        d.rectangle((0, y, w - 1, min(y + 5, h - 1)),
                    fill=_mix(g_deep, g_base, min(1.0, i / (h / 6.0) + 0.15)))

    # De-emphasis pass: the window was reading as a light source competing with the hearth
    # rather than a quiet background detail. Two changes, both small on purpose — this glass
    # still has to read as genuinely cold (see the docstring above), just not as LOUD:
    #   - the moon shrinks and its glow rings dim, so it stops pulling the eye first.
    #   - the near (left, hearth-facing) edge gets a faint warm wash, as if firelight from
    #     across the room is glancing off the inside of the pane — real glass does this.
    warm_w = int(w * 0.22)
    warm_edge = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    wd = ImageDraw.Draw(warm_edge)
    for x in range(warm_w):
        a = int(70 * (1.0 - x / warm_w))
        wd.line((x, 0, x, h - 1), fill=(*FIRE_MID[:3], a))
    img.alpha_composite(warm_edge)

    mx, my, mr = int(w * 0.68), int(h * 0.28), 17  # shrunk from 24 — quieter presence
    for k in range(3, 0, -1):
        d.ellipse((mx - mr - k * 3, my - mr - k * 3, mx + mr + k * 3, my + mr + k * 3),
                  fill=_mix(g_base, FROST, 0.045 * (4 - k)))
    d.ellipse((mx - mr, my - mr, mx + mr, my + mr), fill=_mix(FROST, (255, 255, 255, 255), 0.42))
    d.ellipse((mx - mr + 3, my - mr + 1, mx + mr - 2, my + mr - 3),
              fill=_mix(FROST, (255, 255, 255, 255), 0.65))
    return img


def make_window_frame(w=WINDOW_W, h=WINDOW_H):
    """Sash and glazing bars only — transparent wherever glass shows, so it can be layered
    OVER the falling snow. The frame is firelit (warm ramp) even though the glass behind it
    is not; that warm-sash / cold-glass juxtaposition is the whole point of the object."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f_hi, f_base, f_sh, f_deep = ramp(TABLE_WOOD)
    g_base = ramp(NIGHT_BLUE_DEEP, warm=False)[1]

    # Frost creeping in from the pane corners — drawn on the frame layer so it sits in front
    # of the snow, the way frost on the inside of the glass actually would.
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        for r in range(58, 12, -11):  # frost radius scaled with the window
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=_mix(g_base, FROST, 0.10))

    bar = 11  # glazing bar width scaled with the window
    d.rectangle((w // 2 - bar // 2, 0, w // 2 + bar // 2, h - 1), fill=f_base)
    d.rectangle((0, h // 2 - bar // 2, w - 1, h // 2 + bar // 2), fill=f_base)
    d.line((w // 2 - bar // 2, 0, w // 2 - bar // 2, h - 1), fill=f_hi)
    d.line((0, h // 2 - bar // 2, w - 1, h // 2 - bar // 2), fill=f_hi)

    for i, tone in enumerate((f_hi, f_base, f_sh)):
        d.rectangle((i, i, w - 1 - i, h - 1 - i), outline=tone, width=1)
    d.rectangle((3, 3, w - 4, h - 4), outline=f_deep, width=2)

    # Curtain tie-back (wave-3 polish) — the plainest surface left in this cluster, per direct
    # review, and preferred over a moth silhouette (too small to read at this scale). Left side
    # only, for two reasons: `.scene-window`'s CSS box is right-anchored with `right: -72px`
    # (see index.css), so this canvas's own right ~42% (x > ~196 of 340) never appears on
    # screen at ANY tested viewport — anything drawn past there would simply never render, crop
    # math confirmed against the live layout, not assumed. And of the two sides that ARE
    # visible-ish, the left has more clearance: the sill's herb pot (make_window_sill) sits
    # almost directly under this frame's own left corner, so the hook goes mid-height and the
    # fold is nudged right of x=0 rather than stacking straight on top of it.
    tie_x, tie_y = 30, round(h * 0.42)

    # A small fold of fabric gathered through the hook, drooping down-left — RUG_RED, already
    # the room's warm cloth tone (rug, felt stripe), not a new colour. Drawn before the hook so
    # the ring reads as sitting IN FRONT of the cloth pinched through it, not buried under it.
    c_hi, c_base, c_sh, _ = ramp(RUG_RED)
    fold = [(tie_x, tie_y - 2), (tie_x - 18, tie_y + 34), (tie_x + 4, tie_y + 42)]
    d.polygon(fold, fill=c_base, outline=c_sh)
    d.line((tie_x, tie_y - 2, tie_x - 18, tie_y + 34), fill=c_hi)  # lit edge along the near fold

    d.ellipse((tie_x - 6, tie_y - 6, tie_x + 6, tie_y + 6), outline=GOLD, width=2)
    d.ellipse((tie_x - 2, tie_y - 2, tie_x + 2, tie_y + 2), fill=GOLD)
    return img


# 372x24 canvas -> 186x12 au: 16au wider than the window itself (8au overhang each side), the
# same "sash sits inside a slightly wider ledge" relationship a real windowsill has. A separate
# asset rather than folded into make_window_frame: the frame is stretched to `background-size:
# 100% 100%` over whatever box `.scene-window` is, so adding a ledge inside that same image
# would stretch WITH the window every time its box resizes, rather than staying a fixed-height
# strip under it.
def make_window_sill(w=372, h=24):
    """A plain wood ledge sitting under the window, firelit like the sash it belongs to.

    Carries a small potted herb (2m.1), near the LEFT end on purpose: `.scene-window-sill` is
    right-anchored, and at 768px/390px that right edge is already cropped by `.scene-layer`'s
    own `overflow: hidden` — new detail belongs on the side that stays in frame, not the one
    already getting cut off. Drawn straight into this canvas rather than growing it; the box's
    CSS width/height must stay exactly what `npm run audit` expects.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(TABLE_WOOD)

    d.rectangle((0, 0, w - 1, h - 1), fill=base)
    d.line((0, 0, w - 1, 0), fill=hi)
    d.rectangle((0, h - 6, w - 1, h - 1), fill=deep)
    d.line((0, h - 6, w - 1, h - 6), fill=sh)

    # Potted herb: a small terracotta trapezoid standing on the lit ledge (rows 1-17), three
    # leaf blobs above its rim. `darken(TABLE_WOOD)` for the pot keeps the clay tone in-palette
    # rather than inventing a new colour for one small object.
    pot = darken(TABLE_WOOD, 0.55)
    px, base_y, rim_y = 16, 17, 11
    d.polygon([(px - 3, base_y), (px + 3, base_y), (px + 6, rim_y), (px - 6, rim_y)], fill=pot)
    d.line((px - 6, rim_y, px + 6, rim_y), fill=darken(pot, 0.8))

    leaf_hi, leaf, leaf_sh, _ = ramp(LEAF_GREEN)
    for lx, ly, lr, tone in (
        (px - 4, rim_y - 3, 3, leaf_sh),
        (px, rim_y - 5, 4, leaf),
        (px + 4, rim_y - 3, 3, leaf_hi),
    ):
        d.ellipse((lx - lr, ly - lr, lx + lr, ly + lr), fill=tone)
    return img


def make_snowfall(w=120, h=72):
    """A vertically tileable field of snowflakes.

    Deliberately NOT a stepped sprite sheet like the fire. Snow should drift continuously,
    and stepping it at 4-8fps reads as stuttering rather than falling. Instead this tile is
    seamless top-to-bottom, so CSS can translateY it forever on the compositor and the loop
    is invisible. Flake positions come from fixed arithmetic, never `random`, so the asset
    stays byte-reproducible.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    seed = 11
    for i in range(58):
        seed = (seed * 1103515245 + 12345) % 2147483648
        x = seed % w
        y = (seed // w) % h
        near = (seed // 7) % 3  # depth: nearer flakes are bigger and brighter
        tone = _mix(NIGHT_BLUE_DEEP, FROST, (0.45, 0.7, 1.0)[near])
        if near == 2:
            d.rectangle((x, y, x + 1, y + 1), fill=tone)
        else:
            d.point((x, y), fill=tone)
    return img


def make_floorboards(size=160):
    """Tileable floor — long boards, lit from above, deliberately quiet.

    Judged tiled out to full width (the same check that caught the wall), the previous
    version failed twice over:
      - **Brick bond.** End-joints every 96px at high contrast made a masonry grid, not a
        floor. Real boards are long; joints are rare and barely visible underfoot.
      - **Speckle.** The grain dashes sat near the highlight end of the ramp and read as
        white flecks — debris scattered across the room rather than wood figure.

    The floor covers ~34% of the viewport and sits directly under the table, so its job is to
    be a quiet ground plane. Detail here competes with the cards for nothing. Bigger tile,
    one joint per board, and grain pulled almost to base.
    """
    # Uncompressed ramp tones, per 2g.1 — see make_table_felt() for the measurement. The old
    # 0.45/0.5/0.55 pre-mix plus a 0.16 crown left this tile at 2.4 lightness points of range
    # across 14 colours, i.e. a flat fill where floorboards were intended. The floor is also
    # further from the cards than the felt is, so it can afford more form than the felt can.
    hi, base, sh, deep = ramp(FLOOR_WOOD)

    img = Image.new("RGBA", (size, size), base)
    d = ImageDraw.Draw(img)

    board_h = 32
    # One joint per board, widely spaced and at different offsets, so nothing lines up.
    joints = (103, 37, 128, 61, 14)
    board_tint = (0.00, 0.16, -0.12, 0.07, -0.05)

    for row, by in enumerate(range(0, size, board_h)):
        b_base = _mix(base, hi if board_tint[row] >= 0 else sh, abs(board_tint[row]))
        body = board_h - 2
        for dy in range(body):
            frac = dy / (body - 1)
            # Gentle crown: boards cup slightly, catching light along the middle.
            tone = _mix(b_base, hi, 0.50) if 0.25 < frac < 0.62 else (
                _mix(b_base, sh, 0.24) if frac < 0.85 else _mix(b_base, sh, 0.60))
            d.line((0, by + dy, size, by + dy), fill=tone)

        # Grain: long, low-contrast figure along the board. Barely there by design.
        seed = row * 23 + 7
        for gy in range(3, body - 3, 7):
            x = (seed * 11) % 17
            while x < size:
                run = 14 + (seed % 22)
                d.line((x, by + gy, min(x + run, size), by + gy),
                       fill=_mix(b_base, sh if (seed // 5) % 2 else hi, 0.09))
                x += run + 11 + (seed % 9)
                seed += 13

        jx = joints[row % len(joints)]
        d.line((jx, by, jx, by + body - 1), fill=_mix(b_base, deep, 0.55))

        # Board seam: a soft shadow with a faint lit lip above it, not a hard rule.
        d.line((0, by + body, size, by + body), fill=deep)
        d.line((0, by + body + 1, size, by + body + 1), fill=_mix(b_base, hi, 0.14))
    return img


# --- Living things (Phase 2d.3) ----------------------------------------------------------- #
# A full seated figure (`make_seated_old_timer()`, holding a fan of `_mini_card_back()` cards)
# used to live here, parked in the right margin. 2f.3 replaced him with `make_opponent()`
# across the table, where his hands already are (see that function's docstring). The seated
# generator and its 119 lines of geometry, plus `SEAT_W/H/CX/HEAD_*` and `_mini_card_back()`,
# were dead code from that point on — never called from `main()`, no output file existed for
# them (`public/art/scene/seated_old_timer.png` was already gone) — and stayed in the file for
# two more phases before being deleted here in 2h.1. Audited alongside the other 2g.4 items:
# same failure shape as the orphaned portrait generator below, code that survived because
# nothing forces a generator's absence from `main()` to be noticed.


def make_cat_frames(count=3, w=252, h=160):
    """A cat asleep by the fire. Two frames of slow breathing, plus a third: a quick tail-tip
    flick — the one motion a sleeping cat actually makes without waking up.

    Two frames was enough for the breathing itself — the body rises a pixel, and animated
    slowly that reads fine; more frames would add nothing perceptible there. The tail flick is
    a genuinely separate gesture layered on, not a third breathing state: `rise` only ever
    takes the frame-0/frame-1 values, so the flick frame sits at the same resting body height
    as frame 0 and reads as its own beat rather than a deeper breath.

    Carries a contact shadow. Brown fur on a brown floor with no shadow read as a smudge, and
    `contact_shadow()` had sat unused since 2d.1 built it — this is its first real consumer.

    **Enlarged in 2g.4.** At 26x18 au this was half a card wide and a quarter of one tall —
    Phase 2f's own audit put the error at roughly 14x against a real curled cat, and it read
    as a brown smudge on the floorboards rather than as an animal. Now 44x28 au: about as wide
    as a playing card, which is still stylised but is at least in the same world as the rest of
    the room. Geometry below is proportional so the next resize is one number, not a hunt.
    """
    frames = []
    shadow = contact_shadow(round(w * 0.85), round(h * 0.16), max_alpha=118)
    for i in range(count):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.paste(shadow, (round(w * 0.1), h - round(h * 0.18)), shadow)
        rise = 1 if i == 1 else 0
        body_top = round(h * 0.39) - rise
        ear = round(h * 0.33)
        parts = [
            (_ellipse(round(w * 0.11), body_top, w - round(w * 0.16), h - round(h * 0.17)),
             HAIR_BROWN),
            (_ellipse(w - round(w * 0.30), body_top - round(h * 0.14),
                      w - round(w * 0.05), h - round(h * 0.33)), HAIR_BROWN),
            (_poly([(w - round(w * 0.25), body_top - round(h * 0.11)),
                    (w - round(w * 0.20), body_top - ear),
                    (w - round(w * 0.15), body_top - round(h * 0.08))]), HAIR_BROWN),
            (_poly([(w - round(w * 0.13), body_top - round(h * 0.11)),
                    (w - round(w * 0.07), body_top - ear),
                    (w - round(w * 0.03), body_top - round(h * 0.08))]), HAIR_BROWN),
            (_ellipse(round(w * 0.03), h - round(h * 0.44), round(w * 0.25), h - round(h * 0.22)),
             HAIR_BROWN),
        ]
        if i == 2:
            # Tail-tip flick, frame 3 only. The body ellipse's own right edge stops at
            # w-0.16w=0.84w and the head ellipse's bottom stops at h-0.33h=0.67h, so the
            # pocket at roughly [0.86w, 0.99w] x [0.70h, 0.88h] — lower-right, below the head,
            # past the body's own flank — is genuinely empty in every other frame; verified
            # against the composited PNG, not just this math, before relying on it. A small
            # curled hook, offset from the body/head geometry above rather than reusing any of
            # its coordinates.
            #
            # Its inner vertex (was 0.94w/0.70h) is pulled in to 0.88w/0.61h so the hook's own
            # silhouette laps onto the head ellipse's silhouette by ~15 source px instead of
            # stopping ~15px short of it — confirmed by rasterizing both shapes and measuring
            # their overlap, not eyeballed. Without this the tail was a disconnected blob
            # floating near the hindquarters; the two shapes now share opaque pixels at the seam.
            parts.append((_poly([
                (round(w * 0.86), round(h * 0.86)),
                (round(w * 0.88), round(h * 0.61)),
                (round(w * 0.99), round(h * 0.78)),
                (round(w * 0.93), round(h * 0.88)),
            ]), HAIR_BROWN))
        paste(img, composite_sprite(w, h, parts), 0, 0)
        d = ImageDraw.Draw(img)
        # Closed eyes — two short lines. He is asleep; that is the whole character note.
        for ex in (w - round(w * 0.23), w - round(w * 0.13)):
            d.line((ex, body_top + round(h * 0.11), ex + round(w * 0.07), body_top + round(h * 0.11)),
                   fill=INK, width=2)
        frames.append(img)
    return frames


# A yarn ball beside the sleeping cat (creative-direction pass). A SEPARATE static prop, not
# baked into `make_cat_frames`'s sprite strip — the cat is asleep and this doesn't move, so it
# gets its own generator, CSS class and SceneLayer element instead of riding the cat's own
# two-frame breathing animation. Picked over a toy mouse: HAIR_BROWN (the mouse's body colour
# in the brief) is the cat's own fur colour, so a mouse beside him would read as a second,
# oddly-shaped patch of cat rather than a distinct toy at this small a size. RUG_RED is already
# in the room's palette and reads as a warm, clearly-separate object against both the cat and
# the floorboards.
def make_yarn_ball(w=64, h=52):
    """A flat-shaded ball of yarn with a couple of loose-thread squiggles arcing across it —
    the two-tone-plus-line-work every small prop in this room uses, not an outlined character
    part, since this is an inert toy rather than something alive."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, _ = ramp(RUG_RED)

    shadow = contact_shadow(round(w * 0.8), round(h * 0.22), max_alpha=90)
    img.paste(shadow, (round(w * 0.1), h - round(h * 0.2)), shadow)

    bx0, by0, bx1, by1 = round(w * 0.12), round(h * 0.08), round(w * 0.88), round(h * 0.78)
    d.ellipse((bx0, by0, bx1, by1), fill=base)
    d.ellipse((bx0, by0, bx1, by0 + round((by1 - by0) * 0.45)), fill=hi)
    d.ellipse((bx0, by0 + round((by1 - by0) * 0.55), bx1, by1), fill=sh)

    # Loose-thread squiggles — a shade darker than the ball, arcing across the flat fill, plus
    # one short trailing end so it doesn't read as a plain sphere.
    thread = darken(base)
    d.arc((bx0 + 3, by0 - 2, bx1 - 3, by1 + 2), 205, 335, fill=thread, width=2)
    d.arc((bx0 - 2, by0 + 6, bx1 + 2, by1 - 4), 15, 145, fill=thread, width=2)
    d.line((bx1 - 6, by1 - 10, bx1 + round(w * 0.08), by1 + round(h * 0.06)), fill=thread, width=2)
    return img


def make_rug(w=680, h=140) -> Image.Image:
    """A woven rug on the floor beneath the table's near edge (Phase 2f.5).

    Deferred since 2d.2 for a reason that no longer holds: the table used to span its
    container's full width, so a rug beneath it would have been almost entirely occluded —
    there was no floor left to put one on. The table is now a bounded object with real floor
    visible around it (2f rebuild), which is exactly the precondition that was missing.

    Lives in the SCENE layer (z-index -1), not the game layer, deliberately: the felt (z-index
    1) then naturally overlaps its near edge with no coordinate math required to line them up
    — "table sits on the rug" falls out of the existing z-order for free, the same way the
    opponent's chest is occluded by the felt in front of him.

    A flat rectangular weave, not an oval — an oval rug under a round table reads as a second,
    smaller table; a rectangular one under it reads as a rug the table happens to sit on,
    which is the actual objects most rooms have.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(RUG_RED)
    cream = _mix(RUG_CREAM, base, 0.15)

    # Diamond/braided-rug weave (wave-2 2m.2) — a flat dashed-border rectangle was, per prior
    # review, "the least worked" surface in the room, and it's the single largest floor object
    # in the whole scene. Same coarse-checker `_mix()` technique make_table_felt()'s gingham
    # (and the dresser quilt) use, rotated 45 degrees: alternating bands along BOTH diagonals
    # produce a diamond lattice rather than a square check, which is what actually reads as
    # "woven/braided rug" rather than "tablecloth on the floor". This is a one-off PLACED
    # object, not a repeating background tile like make_floorboards() or make_table_felt()
    # itself (see make_floor_patch()'s own note on that distinction) — it is only ever drawn
    # once, at its own displayed size, so ASSETS.md's "no point features in a tile" rule
    # doesn't bind it the way it binds an actual repeating tile.
    px = img.load()
    check = 26
    d_light = _mix(base, RUG_CREAM, 0.55)
    d_dark = _mix(base, deep, 0.4)
    for y in range(h):
        for x in range(w):
            cell = ((x + y) // check + (x - y) // check) % 2
            px[x, y] = (d_light if cell else d_dark)

    # Woven border: a cream band inset from the edge, then a thin deep line inside that —
    # the two-band border every real woven rug has, not just a solid-colour rectangle.
    inset = 10
    d.rectangle((inset, inset, w - 1 - inset, h - 1 - inset), outline=cream, width=4)
    d.rectangle((inset + 8, inset + 8, w - 9 - inset, h - 9 - inset), outline=deep, width=2)

    # A soft diagonal weave texture on top of the diamond field, fixed arithmetic so it stays
    # reproducible. Samples the field's own current pixel (now the diamond pattern, not a flat
    # `base`) so this pass adds grain to the diamonds instead of flattening them back out.
    seed = 3
    for y in range(inset + 14, h - inset - 14, 6):
        x = -(seed % 12)
        while x < w:
            tone = hi if (seed // 5) % 2 else sh
            under = px[x, y][:3] + (255,)
            d.line((x, y, x + 8, y), fill=_mix(under, tone, 0.30))
            x += 16
            seed += 7

    # Fringe along the two short ends, the detail that most reads as "woven rug" rather than
    # "coloured rectangle".
    for fx in range(4, w - 4, 7):
        d.line((fx, 0, fx, 3), fill=cream)
        d.line((fx, h - 4, fx, h - 1), fill=cream)
    return img


def make_floor_patch(w=400, h=80):
    """A worn patch in the floorboards in front of the player's own seat (2m.1).

    NOT baked into `make_floorboards()` — that function draws a repeating TILE, and per
    ASSETS.md's tiling rules a one-off mark baked into a tile becomes an unmistakable polka-dot
    grid at repeat ("no point features"). This follows the `make_rug()` convention instead: its
    own placed PNG, laid on top of the tiled floor by `.scene-floor-patch` in the scene layer,
    the same way the rug and woodpile already sit on top of `floor.png` without being part of
    it.

    A soft-edged rectangle, not a hard one — years of pacing wear a floor smooth and pale at
    the centre, fading gradually into the surrounding grain, not along a ruled edge. Built the
    same way `make_window_glass()`'s warm hearth-wash edge is: per-pixel alpha computed from
    distance-to-edge, composited onto a transparent canvas, rather than a filled rectangle with
    a flat alpha. No grain or fold detail on top of it on purpose — the whole point of a worn
    patch is that foot traffic has rubbed the board figure smooth; texture here would read as
    "extra floor", not "less floor".

    **CSS placement note (not this function's concern, but why the numbers in
    `.scene-floor-patch` are what they are):** `.hand-tray`'s background is deliberately opaque
    (`rgba(16,11,8,0.82)`) and covers the full width up to ~91au off the floor line at minimum
    — measured, not assumed — so a patch placed BELOW that line, the way "closer to the viewer
    than the rug" reads literally, would be almost entirely hidden the instant a hand is dealt.
    `.scene-floor-patch` instead sits astride the rug's own near edge, mounted AFTER `.scene-rug`
    in `SceneLayer.tsx` so it paints over the rug there — a worn path where the player's own
    footsteps cross the rug's front edge reads as "in front of the seat" without disappearing
    for the entire hand.
    """
    _, base, _, deep = ramp(FLOOR_WOOD)
    # 0.30/205 measured imperceptible against the floorboards' own grain variance (confirmed by
    # outlining it live and comparing with/without). Pushed to the top of a still-plausible
    # "worn smooth" contrast range so it reads by eye, not just in a debug outline.
    tone = _mix(base, deep, 0.58)

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    feather = 22
    max_alpha = 235
    for y in range(h):
        fy = min(y, h - 1 - y, feather) / feather
        for x in range(w):
            fx = min(x, w - 1 - x, feather) / feather
            a = fx * fy
            if a <= 0:
                continue
            px[x, y] = tone[:3] + (int(max_alpha * a),)
    return img


def make_dropped_card(w=72, h=56):
    """A single card, face down, dropped near the floor patch (wave-2 3m.3) — "a hand you can
    only half-remember." A card, not a coin: it ties directly to the game's own theme rather
    than being a generic dropped object, and reuses the real card-back palette (WOOD_DARK /
    GOLD — see `make_card_back()`) so it reads as one of the SAME cards the player holds, just
    one that slipped underfoot, not an unrelated new prop.

    Deliberately its own small generator rather than a call into `make_card_back()`: that
    function is built for game-layer cards at CARD_W/H-derived sizes with a full quilted-back
    pattern, which would be noise at this prop's tiny footprint (a handful of art pixels across
    once placed). This draws a flat two-tone back with a single gold pip, the same "reads as a
    silhouette, not a miniature painting" restraint every other small scene prop in this file
    uses (the mantel candle/tin, the yarn ball, the feed dots).

    Drawn as a skewed quad (a parallelogram, corners offset from a plain rectangle) rather than
    an axis-aligned rect rotated with `Image.rotate` — a card lying loose on a floor is never
    perfectly square to the room, but a first attempt at `rotate()` was checked against the
    real regenerated PNG (not a pre-snap render — see the lesson at the top of this task) and
    the rotation simply didn't survive: at this prop's small footprint on the coarse (chunk=2,
    4au) grid every scene object in this file already wears, a 14x20 rotated card collapsed to
    an unreadable blob once `save_asset()` snapped and halved it. The same exact-corner-polygon
    technique the dresser's folded-letter clutter uses (see `make_dresser()`) survives that
    grid because its edges are drawn once, at their final integer coordinates, rather than
    interpolated by a rotation the grid-snap then has to re-quantise.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx0, cx1 = round(w * 0.22), round(w * 0.64)
    cy0, cy1 = round(h * 0.06), round(h * 0.76)
    tilt = round(w * 0.08)
    quad = [(cx0, cy0 + tilt), (cx1 - tilt, cy0), (cx1, cy1 - tilt), (cx0 + tilt, cy1)]

    shadow = contact_shadow(cx1 - cx0 + 10, max(6, round(h * 0.16)), max_alpha=90)
    img.paste(shadow, (cx0 - 5, cy1 - shadow.height // 2), shadow)

    cxm = sum(p[0] for p in quad) / 4
    cym = sum(p[1] for p in quad) / 4

    def _shrink(t):
        return [(round(px + (cxm - px) * t), round(py + (cym - py) * t)) for px, py in quad]

    # Frame drawn as three stacked, shrinking FILLED quads rather than a thin outline stroke —
    # a 1px `outline=` on a shape this size sits well inside a single cell of the room's coarse
    # (chunk=2, 4au) grid and gets lost/scattered by `save_asset()`'s grid-snap (checked against
    # the real regenerated PNG, not a pre-snap render). A filled band is thick enough to survive
    # quantisation the same way the dresser's own solid-fill shapes do.
    d.polygon(quad, fill=WOOD_DARK, outline=(0, 0, 0, 255))
    d.polygon(_shrink(0.16), fill=GOLD)
    d.polygon(_shrink(0.30), fill=WOOD_DARK)
    d.rectangle((round(cxm) - 3, round(cym) - 3, round(cxm) + 3, round(cym) + 3), fill=GOLD)
    return img


def make_shelf(w=400, h=160):
    """A wall shelf with clutter — jars, books, a lantern. Placed once, never tiled, so unlike
    the wall texture it may carry all the distinctive point detail it likes.

    2j.3: resized 2.5x (120x64 -> 300x160). Every offset below is the original times 2.5, then
    every X POSITION (not size — the items themselves stay their original drawn shape) spread
    by a further 1.333x to reach 400 (200 au final).

    First widened to 572 (286 au) to span the fireplace's full 374 au stone — direct user
    feedback ("the mantle doesnt span the fireplace") — then corrected back down after further
    feedback ("the mantle should not span the whole fireplace, only the hearth"): the firebox
    OPENING itself (see make_fireplace's ox0/ox1: `w * 0.2565` inset each side of its 374 au
    canvas) spans only 96-278 au within that stone, ~182 au wide — the clutter shelf was
    overhanging 96 au of bare flanking stone with no fire beneath it, on the right alone. This
    plank spans 200 au: a small, deliberate overhang past the 182 au opening on each side
    (mantels rest on the stone flanking the firebox, not just the opening), not the full
    374 au surround. `.scene-shelf`'s own CSS comment has the exact matching left/width."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(TABLE_WOOD)

    plank_y = h - 30
    d.rectangle((0, plank_y, w - 1, plank_y + 15), fill=base)
    d.line((0, plank_y, w - 1, plank_y), fill=hi)
    d.line((0, plank_y + 15, w - 1, plank_y + 15), fill=deep)
    for bx in (33, w - 53):
        d.polygon([(bx, plank_y + 15), (bx + 15, plank_y + 15), (bx + 8, h - 1)], fill=sh)

    # Books, leaning. A fourth spine added in 2l.1 (direct user feedback: "fuller" shelf) —
    # same leaning-book draw call as the other three, just one more (bx, bh, col) tuple.
    for i, (bx, bh, col) in enumerate((
        (27, 65, RUG_RED), (53, 75, LEAF_GREEN), (80, 60, CLOTH_BLUE), (107, 50, STEEL),
    )):
        d.rectangle((bx, plank_y - bh, bx + 18, plank_y - 1), fill=col)
        d.rectangle((bx, plank_y - bh, bx + 18, plank_y - bh + 5), fill=_mix(col, GOLD, 0.5))

    # Jars.
    for jx, jh, fill in ((147, 50, _mix(LEAF_GREEN, PARCHMENT, 0.4)), (207, 40, _mix(RUG_RED, PARCHMENT, 0.5))):
        d.rectangle((jx, plank_y - jh, jx + 32, plank_y - 1), fill=fill)
        d.rectangle((jx, plank_y - jh, jx + 32, plank_y - jh + 8), fill=sh)
        d.line((jx, plank_y - jh + 13, jx + 32, plank_y - jh + 13), fill=_mix(fill, PARCHMENT, 0.5))

    # A small vase, 2l.1 — the one gap left on the plank, between the jars and the lantern.
    vx, vh = 257, 35
    d.polygon([(vx + 4, plank_y - vh), (vx + 14, plank_y - vh), (vx + 17, plank_y - 1),
               (vx + 1, plank_y - 1)], fill=_mix(RUG_RED, INK_LIGHT, 0.35))
    d.line((vx + 4, plank_y - vh, vx + 14, plank_y - vh), fill=_mix(GOLD, PARCHMENT, 0.4))

    # Lantern, with a lit pane.
    lx = 287
    d.rectangle((lx, plank_y - 70, lx + 45, plank_y - 1), fill=sh)
    d.rectangle((lx + 8, plank_y - 60, lx + 37, plank_y - 20), fill=_mix(FIRE_MID, PARCHMENT, 0.35))
    d.rectangle((lx + 12, plank_y - 55, lx + 33, plank_y - 25), fill=FIRE_CORE)
    d.rectangle((lx + 15, plank_y - 80, lx + 30, plank_y - 70), fill=deep)
    return img


# --- Wall and floor furniture (Phase 2g.4) ------------------------------------------------ #
# Measured before building any of this: at 1280x860 the span from the fireplace's right edge
# (x=320) to the window's left edge (x=1000) carried NOTHING but the opponent's head. That is
# 680px — 53% of the viewport's width — of bare log wall, in a game whose venue is the whole
# point. The room had a hearth, a window and a shelf, and was otherwise unfurnished.
#
# These are PLACED objects, not tiles, so per ASSETS.md rule 10 they are explicitly exempt
# from "no point features" and "model the material, don't decorate" — those rules exist to
# stop a repeating tile betraying its grid, and none of these repeat. Distinctive one-off
# detail is exactly what they are for.
#
# Every canvas divides by PX * CHUNK_ENV so it can wear the coarse grid with the rest of the
# room.


def make_framed_picture(w=240, h=180):
    """A small framed beach sunset — the most literal reading of "art on walls".

    Direct user feedback: "i want the painting above the fireplace to be of the beach sunset",
    replacing what used to be a daylit mountain/hills scene. Still deliberately WARM and BRIGHT
    for the same reason the old scene was: the one window in this room shows a cold night, so
    this picture is the only place the room gets a genuinely warm-and-bright note (and now,
    unlike the old cool-sky hills, it doesn't even need a temperature contrast of its own — the
    whole scene leans into the same warm arc as the hearth).

    2j.3: resized 2.5x (96x72 -> 240x180). Every offset below is the original times 2.5."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f_hi, f_base, f_sh, f_deep = ramp(TABLE_WOOD)

    d.rectangle((0, 0, w - 1, h - 1), fill=f_base)
    d.rectangle((0, 0, w - 1, 3), fill=f_hi)
    d.rectangle((0, h - 5, w - 1, h - 1), fill=f_deep)

    # The painted scene, inset inside the moulding.
    m = 20
    horizon = h - m - 50

    # Sunset sky: warm, in a HANDFUL of discrete bands from a deep rose top down to a bright
    # gold glow at the horizon — the same quantised-not-continuous shading `light_from` itself
    # uses (see its own docstring): a per-row `_mix` here would pass `_assert_sprite_colours`'
    # ceiling by itself before `light_from` even multiplies it further band-by-band.
    sky_bands = 4
    sky_top = _mix(FIRE_DEEP, ROSE_RED, 0.4)
    sky_colors = [_mix(sky_top, FIRE_CORE, i / (sky_bands - 1)) for i in range(sky_bands)]
    band_h = (horizon - m) / sky_bands
    for i, col in enumerate(sky_colors):
        y0 = m + round(i * band_h)
        y1 = horizon if i == sky_bands - 1 else m + round((i + 1) * band_h)
        d.rectangle((m, y0, w - m - 1, y1 - 1), fill=col)

    # A low sun, half set into the sea — reuses the sky's own brightest (horizon-glow) band
    # rather than introducing a new colour, since that IS the sun's own light.
    sr = 26
    sx, sy = w // 2, horizon
    d.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=sky_colors[-1])

    # Sea: a genuinely blue counterpoint to the warm sky (mixed toward NIGHT_BLUE_DEEP, not
    # FIRE_MID — a sea mixed warm read as flat grey-brown mud rather than water when checked
    # against the actual rendered PNG), with a reflection column under the sun (reusing that
    # same bright sky band), one wave tone, and a narrow strip of sand along the bottom edge.
    sea = _mix(PICTURE_SKY, NIGHT_BLUE_DEEP, 0.3)
    d.rectangle((m, horizon, w - m - 1, h - m - 1), fill=sea)
    d.line((m, horizon, w - m - 1, horizon), fill=INK)
    d.polygon([(sx - 4, horizon), (sx + 4, horizon), (sx + 16, h - m - 1), (sx - 16, h - m - 1)],
              fill=sky_colors[-1])
    wave = _mix(sea, FIRE_CORE, 0.3)
    for wy in range(horizon + 12, h - m - 10, 14):
        d.line((m + 6, wy, w - m - 7, wy), fill=wave, width=2)
    sand = _mix(TABLE_WOOD, FIRE_CORE, 0.2)
    d.rectangle((m, h - m - 10, w - m - 1, h - m - 1), fill=sand)
    return img



def make_wall_clock(size=120):
    """A round wall clock. Reads instantly at a glance and is the only circle on the wall.

    Hands sit at roughly ten-past-ten — the arrangement every clock in every advert uses,
    because it is symmetric, keeps both hands clear of each other, and never reads as an
    accident of where the hands happened to stop.

    2j.3: resized 2.5x (80 -> 200) as part of the "large, deliberately cropped mass"
    philosophy. 2k.1: brought back down to 120 (60 au) on direct user feedback that a
    wall-sized clock read as furniture that ate the wall rather than furnished decor — see
    WINDOW_W/H's own 2k.1 note for the same complaint applied to the window. `r` scales off
    `size`; a handful of the interior strokes (hand width, tick length) are still absolute
    pixel counts and get proportionally chunkier at this size, which reads fine on the same
    coarse grid the rest of the room already uses."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c_hi, case, c_sh, c_deep = ramp(TABLE_WOOD)
    r = size // 2 - 2
    cx = cy = size // 2

    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=case)
    d.arc((cx - r, cy - r, cx + r, cy + r), 200, 340, fill=c_hi, width=5)
    d.arc((cx - r, cy - r, cx + r, cy + r), 20, 160, fill=c_deep, width=5)
    fr = r - 15
    d.ellipse((cx - fr, cy - fr, cx + fr, cy + fr), fill=PARCHMENT)
    d.ellipse((cx - fr, cy - fr, cx + fr, cy + fr), outline=c_deep, width=2)

    # Only the four quarter marks. Twelve ticks was the first attempt and at this size the
    # coarse grid turned them into an even speckled ring — detail that averages out to noise
    # is worse than no detail, because it costs contrast and buys nothing readable.
    for tick in range(4):
        a = math.radians(tick * 90 - 90)
        r0 = fr - 25
        d.line((cx + r0 * math.cos(a), cy + r0 * math.sin(a),
                cx + (fr - 8) * math.cos(a), cy + (fr - 8) * math.sin(a)), fill=INK, width=10)

    # Screen angles: 12 o'clock is -90deg. Ten-past-ten puts the minute hand at the 2 (-30deg)
    # and the hour hand at the 10 (-150deg) — a V opening upward. The first attempt used -62
    # and 118, which are 180 apart, so the two hands drew one straight line through the centre
    # and the clock read as a blank disc with a slash across it.
    for ang, length in ((-30, fr - 18), (-150, fr - 35)):
        a = math.radians(ang)
        d.line((cx, cy, cx + length * math.cos(a), cy + length * math.sin(a)), fill=INK, width=8)
    d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=INK)
    return img


def make_farm_painting(w=700, h=352):
    """A framed farm landscape (replaces the barn star — direct user feedback: "the star looks
    dumb, should be a painting of a long farm landscape using those warm colors"). Now spans the
    WHOLE wall gap between the fireplace-side furniture and the window: it used to share that
    wall with a small antlers plaque and a second small picture frame stacked in a column
    (`right: 240au`), but growing this piece into their space made all three overlap (direct
    user feedback: "overlapping, not big enough, looks dumb as hell") — both were removed
    rather than shrinking this back down, so one real piece of art fills the space three small
    frames used to compete for. See `.scene-farm-painting`'s own CSS comment for the exact
    measured gap and the opponent-clearance this reuses from the antlers' old position.

    Same framed-picture technique make_framed_picture uses (a TABLE_WOOD moulding around an
    inset scene), not a new rendering approach. Golden-hour sky, barn and silo silhouettes in
    FLANNEL_RED (this file's own warm barn-red, already used for the Old-Timer's shirt) and a
    fence line, all warmed with the same FIRE_*/GOLD tones the hearth itself uses, so the
    painting reads as part of this room's palette rather than an unrelated cool daylight scene.

    RE-COMPOSED TWICE now, both times the same lesson learned the hard way. First for 3.65:1
    (this box grew 190->350au wide with no matching change to what was IN it — "the artist
    need to revisit how the painting itself looks"): every element below used fractions of `w`,
    so nothing broke on the stretch, but the composition was one small barn in the left quarter
    with three flat, empty bands of sky and field filling the rest — correct fractions, wrong
    density. Fixed by building it AS a panorama: a full multi-peak ridge, a barn AND a silo, a
    tree, a fence spanning the whole field.

    Second time, same lesson, the OTHER axis: direct user feedback that the finished piece
    "isn't tall enough and leaves too much white space / wall space" — the frame itself sat in
    a much taller gap on the wall than its own 192-tall canvas used (measured live: the wall
    band between ceiling and floor is ~350au tall; the painting was 96). Doubling the canvas
    height alone would have reproduced the EXACT width-axis mistake above one dimension later —
    the ridge/ground fractions below are all relative to `ih`, so they'd have scaled up in
    lockstep with a taller canvas and left the SKY (already 66% of the frame) even more
    conspicuously empty, the same "more of its own empty middle" failure just rotated 90
    degrees. So this pass changes TWO things together, not just the canvas: the ground's own
    share of the frame grows from 34% to 46% (a taller frame needs more happening below the
    horizon, not a taller strip of the same thin field), and the sky gets actual content —
    three simple clouds — instead of staying a bare gradient now that there's real room for the
    eye to notice it's bare.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f_hi, f_base, f_sh, f_deep = ramp(TABLE_WOOD)

    d.rectangle((0, 0, w - 1, h - 1), fill=f_base)
    d.rectangle((0, 0, w - 1, 1), fill=f_hi)
    d.rectangle((0, h - 3, w - 1, h - 1), fill=f_deep)

    m = 6
    ih = h - 2 * m
    horizon = h - m - round(ih * 0.46)

    # Golden-hour sky, in a HANDFUL of discrete bands from a deep rose top to a bright gold
    # horizon glow — quantised, not a per-row gradient, for the same reason
    # make_framed_picture's own sunset sky is: `_assert_sprite_colours`' ceiling is measured
    # after `light_from` multiplies whatever's here band-by-band, and a smooth per-row ramp
    # blows that budget on its own before `light_from` even runs.
    sky_bands = 3
    sky_top = _mix(FIRE_DEEP, ROSE_RED, 0.4)
    sky_colors = [_mix(sky_top, FIRE_CORE, i / (sky_bands - 1)) for i in range(sky_bands)]
    band_h = (horizon - m) / sky_bands
    for i, col in enumerate(sky_colors):
        y0 = m + round(i * band_h)
        y1 = horizon if i == sky_bands - 1 else m + round((i + 1) * band_h)
        d.rectangle((m, y0, w - m - 1, y1 - 1), fill=col)

    # Three simple clouds, flat-shaded lozenges lighter than whichever sky band they sit in —
    # a taller frame gives the sky enough real estate that leaving it a bare gradient reads as
    # unfinished rather than as a clean sunset (the same complaint that started this pass, just
    # inside the painting instead of around it). Kept to the TOP band only, well clear of the
    # sun and the ridge, so they read as distant weather, not clutter competing with either.
    cloud_col = _mix(sky_colors[0], PARCHMENT, 0.5)
    for cx_frac, cy_frac, cw_frac in ((0.14, 0.22, 0.10), (0.34, 0.15, 0.07), (0.78, 0.20, 0.09)):
        ccx, ccy = round(w * cx_frac), m + round(ih * cy_frac)
        ccw, cch = round(w * cw_frac), max(3, round(ih * cw_frac * 0.28))
        d.ellipse((ccx - ccw, ccy - cch, ccx + ccw, ccy + cch), fill=cloud_col)
        d.ellipse((ccx - ccw // 2, ccy - cch - cch // 2, ccx + ccw, ccy + cch // 2), fill=cloud_col)

    # The sun sits at 0.6w in the ORIGINAL 2:1 composition (just right of centre). Kept at the
    # same fraction — a panorama's sun doesn't need to move just because the canvas got wider.
    sr = round(ih * 0.22)
    sx, sy = round(w * 0.6), horizon
    d.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=sky_colors[-1])

    # Rolling fields, warmed off LEAF_GREEN toward gold rather than the cool green the other
    # framed pictures' daylit hills use — this is a sunset field, not daylight grass.
    hill_hi, hill, hill_sh, _ = ramp(LEAF_GREEN)
    hill_hi = _mix(hill_hi, GOLD, 0.4)
    hill = _mix(hill, GOLD, 0.35)
    hill_sh = _mix(hill_sh, FIRE_DEEP, 0.3)
    d.rectangle((m, horizon, w - m - 1, h - m - 1), fill=hill)
    d.line((m, horizon, w - m - 1, horizon), fill=hill_sh)

    # A RIDGE LINE the full width — a repeating chain of low peaks (period ~0.09w, height
    # varying peak-to-peak via a simple phase offset so it doesn't read as a mechanical zigzag),
    # not one triangle near the barn. This is what actually makes the wide canvas read as a
    # panorama instead of "one hill, then a lot of nothing."
    peak_period = max(24, round(w * 0.085))
    peak_h = ih * 0.11
    ridge = [(m, horizon)]
    n_peaks = (w - 2 * m) // peak_period + 1
    for i in range(n_peaks + 1):
        x = m + i * peak_period
        # Every third peak taller, so the skyline has a rhythm rather than perfectly even teeth.
        h_frac = 1.0 if i % 3 == 1 else 0.55
        ridge.append((min(x, w - m), horizon - round(peak_h * h_frac)))
        ridge.append((min(x + peak_period // 2, w - m), horizon))
    ridge.append((w - m, horizon))
    ridge.append((w - m, horizon + round(ih * 0.04)))
    ridge.append((m, horizon + round(ih * 0.04)))
    d.polygon(ridge, fill=hill_hi)

    # Barn (left third) and silo (right third): two farm structures at different points along
    # the ridge, not one, so neither half of a 3.65:1 frame is a bare field. Each sits with its
    # own base ON the horizon, same as the original barn did.
    #
    # WIDTH keyed off `ih`, not `w`, unlike everything else in this function — found live after
    # the height-rebalancing pass above: with width still a fraction of `w` (unchanged) and
    # height a fraction of the now much taller `ih`, both structures rendered as thin, tall
    # towers (the barn's own roof read as a spire, not a barn) the moment `h` grew. Basing
    # WIDTH on `ih` too keeps each structure's own width:height ratio constant regardless of
    # how tall the overall canvas is — the actual bug, not the ridge/fence/tree fractions
    # above, which stayed fine because they were never anchored to `w` alone in a way that
    # implied a fixed shape.
    def _barn(bx):
        bh = round(ih * 0.30)
        bw = round(ih * 0.26)
        by1 = horizon + round(ih * 0.03)
        by0 = by1 - bh
        d.rectangle((bx, by0, bx + bw, by1), fill=FLANNEL_RED)
        d.polygon([(bx - 3, by0), (bx + bw // 2, by0 - round(bh * 0.45)), (bx + bw + 3, by0)],
                  fill=darken(FLANNEL_RED, 0.7))

    def _silo(sx0):
        sh = round(ih * 0.34)
        sw = round(ih * 0.10)
        sy1 = horizon + round(ih * 0.03)
        sy0 = sy1 - sh
        d.rectangle((sx0, sy0, sx0 + sw, sy1), fill=_mix(GOLD, PARCHMENT, 0.35))
        cap = sw // 2 + 2
        d.polygon([(sx0 - 2, sy0), (sx0 + sw // 2, sy0 - cap), (sx0 + sw + 2, sy0)],
                   fill=darken(FLANNEL_RED, 0.55))

    _barn(m + round(w * 0.14))
    _silo(m + round(w * 0.60))

    # One tree, roughly a third of the way from the right — a vertical accent breaking up a
    # composition that is otherwise all horizontal bands and horizontal ridge.
    tx = m + round(w * 0.84)
    trunk_h = round(ih * 0.16)
    ty1 = horizon + round(ih * 0.03)
    ty0 = ty1 - trunk_h
    d.line((tx, ty0, tx, ty1), fill=darken(TABLE_WOOD, 0.55), width=max(2, round(w * 0.006)))
    cr = round(ih * 0.14)
    d.ellipse((tx - cr, ty0 - cr, tx + cr, ty0 + cr // 2), fill=hill_hi)
    d.ellipse((tx - cr + 2, ty0 - cr + 3, tx + cr - 3, ty0 + cr // 2 - 2), fill=hill)

    # A post-and-rail fence walking across the WHOLE near field now, not just the right half —
    # at 2:1 a half-width fence read as "the fence," at 3.65:1 it read as a fence that gives up
    # partway across its own field.
    fence_y = h - m - round(ih * 0.06)
    for px in range(m, w - m, round(w * 0.045)):
        d.line((px, fence_y - round(ih * 0.10), px, fence_y), fill=WOOD_DARK, width=2)
    d.line((m, fence_y - round(ih * 0.06), w - m - 1, fence_y - round(ih * 0.06)),
           fill=WOOD_DARK, width=2)
    return img


def make_coat_hooks(w=208, h=268):
    """A hook rail with a coat hung on it. The one object here that implies a PERSON — someone
    came in out of the snow and hung their coat up — which is a different kind of warmth from
    the fire, and cheap to state.

    2j.3: resized ~2.48x (84x108 -> 208x268). Every offset below is the original times ~2.48."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r_hi, rail, r_sh, r_deep = ramp(TABLE_WOOD)
    c_hi, coat, c_sh, c_deep = ramp(COAT_GREEN)

    # Rail thickness matches `make_fireplace`'s own mantel slab exactly (70 canvas-px = 35au,
    # the same board thickness in the same au units) and mirrors its base/highlight/shadow-line
    # structure, so `.scene-coat-hooks` positioned flush against the mantel (see that CSS rule's
    # own comment) reads as the SAME shelf continuing rightward rather than a second, thinner,
    # differently-lit rail floating at an unrelated height — the "mantel doesn't stretch the
    # whole length" complaint was two boards at two different heights, not one broken board.
    rail_h = 70
    d.rectangle((0, 0, w - 1, rail_h), fill=rail)
    d.rectangle((0, 0, w - 1, 24), fill=r_hi)
    d.line((0, 46, w - 1, 46), fill=r_sh)
    d.line((0, rail_h, w - 1, rail_h), fill=r_deep)
    for hx in (35, w // 2, w - 37):
        d.rectangle((hx - 5, rail_h, hx + 5, rail_h + 18), fill=r_sh)
        d.rectangle((hx - 10, rail_h + 13, hx + 10, rail_h + 20), fill=r_deep)
    peg_y = rail_h + 18  # dowel bottom -- shared anchor for everything hanging off any hook

    # The coat, hanging from the middle hook: shoulders, body, two sleeves. Was a single sharp
    # diagonal from collar straight out to the cuff (cx-15,top)->(cx-64,top+50) with no vertex
    # between them, which is a dart/arrow, not a shoulder -- a hung coat's shoulder seam is a
    # short, near-horizontal cap, and the sleeve hangs down roughly plumb below it rather than
    # continuing to flare outward. Now built as two segments per side: a short cap out to the
    # shoulder point, then the sleeve outer edge falling close to vertical, then the cuff tucking
    # back in toward the body -- the silhouette a coat on a hook actually has.
    cx, top = w // 2, peg_y - 3
    d.polygon([(cx - 15, top), (cx + 15, top), (cx + 40, top + 16), (cx + 44, top + 55),
               (cx + 30, top + 70), (cx + 37, h - 15), (cx - 37, h - 15), (cx - 30, top + 70),
               (cx - 44, top + 55), (cx - 40, top + 16)], fill=coat)
    d.polygon([(cx - 15, top), (cx + 2, top), (cx + 2, h - 15), (cx - 12, h - 15)], fill=c_sh)
    d.line((cx - 40, top + 16, cx - 15, top), fill=c_hi, width=4)
    d.line((cx + 15, top, cx + 40, top + 16), fill=c_deep, width=4)
    for by in (top + 40, top + 80, top + 120):
        d.rectangle((cx - 7, by, cx - 2, by + 5), fill=GOLD)

    # Left hook: a striped scarf draped over the peg, so it isn't left bare. Chosen over a
    # knit hat — stripes stay legible at this sprite's small size, where a rounded hat
    # silhouette tends to blob into the peg beneath it.
    sx = 35
    d.rectangle((sx - 14, peg_y - 2, sx + 14, peg_y + 8), fill=RUG_RED)  # doubled over the peg
    stripe = (RUG_RED, CLOTH_BLUE)
    tail_h = 12
    for i in range(7):
        tone = stripe[i % 2]
        y0 = peg_y + 8 + i * tail_h
        d.rectangle((sx - 13, y0, sx - 3, y0 + tail_h - 2), fill=tone)      # longer tail
        if i < 5:
            d.rectangle((sx + 3, y0, sx + 13, y0 + tail_h - 2), fill=tone)  # shorter tail

    # Right hook (wave-3): a mitten pair on their own connecting cord, the way a child's
    # mittens are kept from getting lost. Redesigned (creative-direction pass): the old pair
    # was two bare rectangles joined by a straight rigid bar flush with their own top edge --
    # at this size that read as headphone ear-cups (or a bird), and the thumb notches were tiny
    # nubs right at the top, easy to miss as anything in particular. Now each mitten is a
    # tapered body (wide cuff, rounded fingertip) with the cord SAGGING between the two cuffs
    # like a real string threaded through them, and a thumb big enough to read: a full
    # triangular wedge a third of the way down the palm, not a corner nick.
    mx = w - 37
    m_hi, mitt, m_sh, _ = ramp(CLOTH_BLUE)
    cuff_top, cuff_bot, body_bot = peg_y + 6, peg_y + 13, peg_y + 33
    d.line((mx - 11, cuff_top - 3, mx, cuff_top + 3), fill=m_sh, width=2)  # sagging cord, left half
    d.line((mx, cuff_top + 3, mx + 11, cuff_top - 3), fill=m_sh, width=2)  # sagging cord, right half
    for side in (-1, 1):
        c = mx + side * 11
        d.polygon([(c - 7, cuff_top), (c + 7, cuff_top), (c + 6, body_bot - 4),
                   (c, body_bot), (c - 6, body_bot - 4)], fill=mitt)          # tapered palm
        d.rectangle((c - 7, cuff_top, c + 7, cuff_bot), fill=m_sh)           # ribbed cuff (top)
        d.rectangle((c - 7, cuff_top, c + 7, cuff_top + 2), fill=m_hi)       # lit cuff edge
        tx = c + side * 7
        d.polygon([(tx, cuff_bot + 3), (tx + side * 9, cuff_bot + 7),
                   (tx + side * 9, cuff_bot + 13), (tx, cuff_bot + 11)], fill=mitt)  # thumb
        d.line((tx, cuff_bot + 3, tx + side * 9, cuff_bot + 7), fill=m_hi, width=1)
    return img


def make_woodpile(w=260, h=160):
    """Split logs stacked beside the hearth — where the fire's fuel visibly comes from.

    Log ENDS face the room, so this is a grid of circles in a rough stack rather than a row of
    cylinders; that is both what a real woodpile looks like from the front and much easier to
    read at this size.

    2j.3: resized 2.5x (104x64 -> 260x160) along with the rest of the room's furniture, scaled
    off the same table-as-ruler that resized the hearth and window. `r` (log radius) and every
    offset below are the original values times 2.5, so the logs get proportionally bigger and
    there are proportionally more rows, rather than the same handful of logs blown up blurry.

    2j.4: carries a contact shadow, the same `contact_shadow()` the cat has had since 2d.3 —
    this was the one floor-standing prop in the room still floating with nothing pinning it to
    the boards under it. Pasted first, behind the base row of logs, the same ordering the cat
    uses."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    b_hi, bark, b_sh, b_deep = ramp(WOOD_MED)
    f_hi, face, f_sh, _ = ramp(PARCHMENT_SHADOW)

    shadow = contact_shadow(round(w * 0.9), round(h * 0.15), max_alpha=110)
    img.paste(shadow, (round(w * 0.05), h - round(h * 0.16)), shadow)

    # A deliberate 4-3-2-1 pyramid, each row one log narrower than the one below and centred
    # over the base row's own footprint, so the taper reads as intentional rather than as
    # whatever a row happened to fit. The previous per-row `inset` values (15/33/50/68) were
    # hand-picked and never checked against the canvas: the bottom two rows' rightmost logs ran
    # past `w` (the base row's 5th log by 55px) and were silently clipped by the canvas edge --
    # that's the "uneven top row, stray gaps" the pile was reported as looking like. The base
    # row's own y also ran 8px past `h` for the same reason. Both are arithmetic here instead of
    # picked-by-eye, so a row can't silently run off either edge again.
    r = 28
    d_ia = r * 2  # log-end diameter ("d" is already the ImageDraw handle)
    gap = 6
    spacing = d_ia + gap
    row_counts = (4, 3, 2, 1)
    base_width = (row_counts[0] - 1) * spacing + d_ia
    left_margin = (w - base_width) // 2
    row_step = 30
    base_y = h - r - 4
    for row, count in enumerate(row_counts):
        y = base_y - row * row_step
        row_width = (count - 1) * spacing + d_ia
        x0 = left_margin + (base_width - row_width) // 2
        for i in range(count):
            x = x0 + i * spacing
            d.ellipse((x, y - r, x + d_ia, y + r), fill=bark)
            d.ellipse((x + 5, y - r + 5, x + d_ia - 5, y + r - 5), fill=face)
            # Growth rings, and a split — enough to say "cut log" and no more.
            d.ellipse((x + 12, y - r + 12, x + d_ia - 12, y + r - 12), outline=f_sh, width=2)
            d.line((x + r, y - r + 8, x + r, y + r - 8), fill=f_sh, width=2)
            d.arc((x, y - r, x + d_ia, y + r), 200, 340, fill=b_hi, width=2)
    return img


# A small hearth mat (wave-2), directly in front of the firebox opening — distinct from the
# room's large woven `make_rug()`: a plain worked mat, not a second rug. Its own placed floor
# element rather than baked into make_fireplace(): it sits on the FLOOR plane in front of the
# hearth, not on the fireplace structure itself, same reasoning as make_woodpile()/
# make_dresser() being separate from the wall/furniture they stand beside.
def make_hearth_mat(w=180, h=48):
    """A worn red/brown mat lying flat on the floor at the firebox's base.

    Same `contact_shadow()` treatment as the woodpile/dresser, so it reads as grounded rather
    than floating. Colour is RUG_RED pulled toward WOOD_MED rather than reused as-is, so it
    stays visibly its own muted, worn tone next to the rug's brighter red instead of reading
    as a second copy of it.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(_mix(RUG_RED, WOOD_MED, 0.4))

    shadow = contact_shadow(round(w * 0.92), round(h * 0.35), max_alpha=100)
    img.paste(shadow, (round(w * 0.04), h - round(h * 0.3)), shadow)

    top, bottom = round(h * 0.12), h - round(h * 0.22)
    left, right = round(w * 0.03), w - round(w * 0.03)
    d.rectangle((left, top, right, bottom), fill=base)

    # A coarse woven check (wave-3) -- the same `_mix()` checkerboard technique make_rug() and
    # the dresser's folded quilt already use, scaled down to this mat's own small footprint.
    # A flat square check, not the rug's diagonal diamond lattice: this is a small floor mat,
    # not a second feature rug, so the texture stays a quiet weave rather than a braided pattern
    # competing with it. Drawn over the base fill and BEFORE the top/bottom edge bands and inset
    # outline below, so those redraw cleanly over the check's own edges.
    check = 6
    light = _mix(base, hi, 0.25)
    dark = _mix(base, deep, 0.22)
    for wy in range(top, bottom):
        band_y = ((wy - top) // check) % 2 == 0
        for wx in range(left, right, check):
            band_x = ((wx - left) // check) % 2 == 0
            tone = dark if (band_x and band_y) else (light if (band_x or band_y) else base)
            d.line((wx, wy, min(wx + check - 1, right - 1), wy), fill=tone)

    d.rectangle((left, top, right, top + 2), fill=hi)
    d.rectangle((left, bottom - 2, right, bottom), fill=deep)
    d.rectangle((left + 4, top + 4, right - 4, bottom - 4), outline=sh, width=2)
    return img


# A low dresser under the window (2l.1 — direct user feedback: the window sat too close to the
# floor with nothing under it, and separately, the floor near it read as bare). Raising the
# window freed a band of wall/floor between its new sill and the floor line; this fills it.
# Flat-shaded like woodpile/coat_hooks above, not outlined like the cat/opponent — it is
# furniture, not a character, and every other piece of furniture in this room reads the same
# way.
def make_dresser(w=192, h=128):
    """A simple three-drawer dresser, seen straight-on. Two brass-dot pulls per drawer, a
    plinth base, and a lit top edge/shadowed underside — the same two-tone body every other
    wood object in this room uses (see darken()/ramp() call sites throughout)."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(TABLE_WOOD)

    shadow = contact_shadow(round(w * 0.92), round(h * 0.14), max_alpha=110)
    img.paste(shadow, (round(w * 0.04), h - round(h * 0.12)), shadow)

    # Carcass.
    top, bottom = round(h * 0.10), h - round(h * 0.12)
    left, right = round(w * 0.04), w - round(w * 0.04)
    d.rectangle((left, top, right, bottom), fill=base)
    d.rectangle((left, top, right, top + 4), fill=hi)
    d.rectangle((left, bottom - 4, right, bottom), fill=deep)
    d.rectangle((left, top, left + 4, bottom), fill=sh)
    d.rectangle((right - 4, top, right, bottom), fill=deep)

    # A slab top overhanging the carcass slightly, the way a real dresser's does.
    d.rectangle((left - 6, top - 8, right + 6, top), fill=hi)
    d.rectangle((left - 6, top - 8, right + 6, top - 6), fill=_mix(hi, PARCHMENT, 0.3))

    # A folded quilt draped over the slab's near (left) corner (2m.1), hanging down over the
    # top drawer's face. Its top edge is flush with the slab top (top - 8) and never higher —
    # the direction review flagged the tight wall-tile band above the window, so nothing here
    # may climb above the slab it sits on. Cloth tone is CLOTH_BLUE (already in-palette, a cool
    # contrast against the wood) run through the same coarse checkerboard `_mix()` technique
    # make_table_felt() uses for the gingham tablecloth, just scaled down to a small object.
    qx0, qx1 = left - 6, left + 58
    qy0, qy1 = top - 8, top + 32
    # CLOTH_BLUE measures under 6% HLS saturation — already near-neutral before light_from's
    # warm-hue rotation (see that function's docstring) even touches it, so the room-wide warm
    # wash finishes the job: measured, the quilt was landing at (118,118,110)-(99,96,85), a
    # gray-olive indistinguishable from the shadow next to it. A local, saturation-boosted
    # variant survives the same wash reading blue; CLOTH_BLUE itself (used elsewhere in this
    # file — shelf books, felt stripe) is untouched.
    _qh, _ql, _qs = colorsys.rgb_to_hls(*[v / 255 for v in CLOTH_BLUE[:3]])
    quilt_blue = tuple(round(v * 255) for v in
                        colorsys.hls_to_rgb(_qh, min(0.96, _ql + 0.06), min(1.0, _qs + 0.32))) + (255,)
    q_hi, q_base, q_sh, q_deep = ramp(quilt_blue)
    check = 10
    light = _mix(q_base, q_hi, 0.18)
    dark = _mix(q_base, q_sh, 0.22)
    for qy in range(qy0, qy1):
        band_y = ((qy - qy0) // check) % 2 == 0
        for qx in range(qx0, qx1, check):
            band_x = ((qx - qx0) // check) % 2 == 0
            tone = dark if (band_x and band_y) else (light if (band_x or band_y) else q_base)
            d.line((qx, qy, min(qx + check - 1, qx1 - 1), qy), fill=tone)
    # 2-3 fold lines, darkened steps rather than a flat cloth — a quilt draped over a corner
    # creases, it doesn't lie flat.
    for fy in (qy0 + 10, qy0 + 22, qy0 + 33):
        d.line((qx0, fy, qx1, fy), fill=darken(q_base, 0.7))
    d.line((qx0, qy0, qx1, qy0), fill=q_hi)  # lit crest along the fold nearest the light
    # A 1px light-toned rim on the quilt's own silhouette so it separates from whatever sits
    # against it (the top drawer's routed shadow line just below) instead of blending in.
    rim = _mix(q_hi, PARCHMENT, 0.35)
    d.line((qx0, qy0, qx0, qy1 - 1), fill=rim)
    d.line((qx1 - 1, qy0, qx1 - 1, qy1 - 1), fill=rim)
    d.line((qx0, qy1 - 1, qx1 - 1, qy1 - 1), fill=rim)

    # A folded letter on the bare right ~60% of the slab (wave 2, 3m.1) — the quilt above only
    # covers the near-left corner (qx1 = left + 58 = 66), leaving right+6-66 = ~124 of the
    # slab's ~196 width untouched. Kept in the same y-band the quilt proved safe (top-8 up top,
    # never higher; bottom clear of drawer_top = top+10, where the drawers loop below repaints
    # the full carcass width and would otherwise erase anything lower) so it needs no drawer
    # reordering. A flat paper, not the candle/cribbage-board alternatives, reads clearest in
    # that ~16px band — a candle's flame tip would want height this band doesn't have without
    # breaking the "never above top-8" rule the quilt already established.
    lx1, lx0 = right - 10, right - 10 - 46
    ly0, ly1 = top - 6, top + 10
    # PARCHMENT run straight through ramp() measured, on the regenerated PNG, at (198,193,174)/
    # (209,204,184) against the slab's own lit top edge at (206,181,128) right next to it — same
    # spirit of near-miss the quilt above was already fixed for (see its own comment: "gray-olive
    # indistinguishable from the shadow next to it"). A flat paper tone this close in VALUE to the
    # wood it sits on reads as a smudge, not an object, no matter how the ramp shades it. Darkened
    # 22% before ramping — same technique as the quilt's own saturation-boosted variant, just
    # pushing lightness instead of hue since a letter has no hue to lean on that a wood tone
    # wouldn't also have — so the base tone itself carries a real value gap from the slab highlight
    # rather than relying on the two 1px accent lines below to do all the separating.
    letter_tone = darken(PARCHMENT, 0.78)
    l_hi, l_base, l_sh, l_deep = ramp(letter_tone)
    letter = [(lx0, ly0 + 3), (lx1 - 4, ly0), (lx1, ly1 - 3), (lx0 + 4, ly1)]
    d.polygon(letter, fill=l_base, outline=l_deep)
    d.line((lx0, ly0 + 3, lx1 - 4, ly0), fill=l_hi)  # lit top edge, angled with the fold
    # A single crease a third of the way down — a letter folded once, not lying flat off the
    # press. Deepened from l_sh to l_deep so the fold itself reads as a definite dark line
    # rather than another near-miss against the slab.
    d.line((lx0 + 2, ly0 + 8, lx1 - 3, ly0 + 5), fill=l_deep)
    # A 1px near-white rim along the letter's own left edge (2m.2 fix) — the same "separates
    # from whatever sits against it" job the quilt's rim does above, but toward white rather
    # than toward PARCHMENT since the letter's base tone already IS parchment; mixing further
    # toward its own base would do nothing.
    d.line((lx0, ly0 + 3, lx0 + 4, ly1), fill=_mix(l_hi, (255, 255, 255, 255), 0.5))

    # A small flower arrangement (creative-direction pass — direct user feedback: "i think
    # flowers would look good on the dresser") in the one strip of slab still bare: the quilt
    # covers x < 66 (qx1 = left + 58), the letter covers x >= 128 (lx0), leaving a clean ~62px
    # gap between them. Kept in the same y-band the letter already proved safe — never above
    # top - 8 (= 5, the slab's own top edge, see the quilt's own comment) and never at/below
    # `top + 10` (= drawer_top, defined just below), since the drawers loop that follows draws
    # AFTER this block and repaints the full carcass width, erasing anything lower.
    #
    # Built entirely from tones already used elsewhere on THIS slab, in the SAME light_from
    # band they already appear in, rather than a new ramp() of its own — `_assert_sprite_colours`
    # measured this sprite at 63/64 colours before this pass, so there was no budget left for a
    # genuinely new hue. `light_from` (applied to the finished sprite in main()) shifts colour by
    # x-position in 5 discrete bands, so reusing a colour ONLY avoids a new budget entry if it
    # lands in a band that colour already occupies elsewhere — a value reused at a new x can
    # still mint a new post-band colour. This gap sits entirely in band index 2 (x ~77-115 of
    # 192): `hi`/`deep` (the carcass's own wood ramp) already cover that band via the slab's
    # full-width top edge and the drawers' full-width bottom strips, and `q_base`/`q_sh`/`q_hi`
    # (the quilt's blue ramp) already cover it via the ajar bottom drawer's fabric wedge
    # (`wx = 96`, dead centre of this same band) — so the vase (wood-ramp cream/dark) and the
    # blooms (the quilt's own blue, forget-me-nots rather than a new flower colour) cost nothing.
    # Direct user feedback on the FIRST pass at this ("i think flowers would look good") was
    # "still want a vase full of flowers on dresser" — at the dresser's actual in-game display
    # size (`.scene-dresser`, 96x64 au *before* `--px`), the first attempt measured out to a
    # 10x7 au vase and 6au flower heads: technically present, illegible as "a vase full of
    # flowers" — closer to the "small blue blob the size of a drawer pull" the follow-up report
    # named. This pass uses the FULL quilt-to-letter gap (58au instead of 54) and grows the vase
    # and heads as far as the fixed y-band allows (still never above top-8 / at-or-below
    # drawer_top — that band is only 18au tall regardless, so most of the size gain is
    # horizontal: 4 bigger, more widely-fanned heads instead of 3 small tight ones), plus a
    # small cream centre dot per bloom (reusing `hi`, already proven safe at every x-band via
    # the slab's own full-width top edge) so each head reads as a distinct flower rather than a
    # flat dot.
    fx0, fx1 = left + 60, left + 60 + 58
    vcx = (fx0 + fx1) // 2
    # Tall enough that a solid band of fill survives below the stems eating into its rim (a
    # first pass at this made the vase only 9au tall AND filled it `hi` — the same tone as the
    # slab top it sits on, so even the fill that did survive the stems/outline was invisible
    # against its own backdrop: no contrast, just a dark outline around a patch of "more slab").
    # Filled `deep` / outlined `hi` instead — dark body against the light slab-top and mid-tone
    # carcass behind it reads as an actual silhouette rather than a same-tone smudge.
    vase_bot, vase_top = top + 9, top + 9 - 14
    d.polygon([(vcx - 3, vase_top), (vcx + 3, vase_top), (vcx + 7, vase_bot), (vcx - 7, vase_bot)],
              fill=deep, outline=hi)
    # A lit streak down the body (reusing the slab's own second-highlight mix verbatim, so this
    # is free) — gives the vase a rounded read instead of a flat silhouette.
    d.line((vcx - 2, vase_top + 3, vcx - 2, vase_bot - 1), fill=_mix(hi, PARCHMENT, 0.3))

    # Four stems and flower heads fanned off the rim, spread across the widened gap. Stems start
    # from points spread along the rim width (not one shared pixel) so the fan doesn't collapse
    # into a single blue smear where they'd otherwise all cross.
    # Spaced apart enough that a real gap of background shows between neighbours — packed any
    # tighter (a first pass had them 9au apart, edges nearly touching) they fused into one
    # mottled mass at this sprite's actual resolution instead of reading as separate blooms.
    # Capped at +-16au from centre, not wider: `light_from` bands this sprite roughly every 38au
    # and `_assert_sprite_colours` measured a wider (+-20au) spread at 65/64 colours — a head
    # drifting into the NEXT band mints a new post-light-shift colour even reusing an in-palette
    # tone (see this block's own comment above on `light_from` bands), so this stays inside the
    # one band the quilt-blue tones are already proven safe in.
    heads = ((vcx - 16, top - 4, q_base, q_hi), (vcx - 5, top - 3, q_sh, q_hi),
             (vcx + 6, top - 4, q_base, q_sh), (vcx + 16, top - 3, q_sh, q_base))
    for hx, hy, tone, edge in heads:
        stem_x0 = vcx + round((hx - vcx) * 0.35)
        d.line((stem_x0, vase_top + 3, hx, hy + 4), fill=q_sh, width=2)
        d.ellipse((hx - 4, hy - 4, hx + 4, hy + 4), fill=tone)
        d.ellipse((hx - 4, hy - 4, hx, hy), fill=edge)  # lit-side quarter of each bloom
        d.ellipse((hx - 1, hy - 1, hx + 1, hy + 1), fill=hi)  # cream centre, reads as a flower

    # Three drawers, stacked, each with a routed shadow line and two pulls.
    drawer_top, drawer_bottom = top + 10, bottom - 10
    gap = 6
    dh = (drawer_bottom - drawer_top - gap * 2) // 3
    for i in range(3):
        dy0 = drawer_top + i * (dh + gap)
        dy1 = dy0 + dh
        # Bottom drawer only, left ajar (wave-3 polish): nudged 3px down so its face reads as
        # slightly pulled out, with a wedge of fabric caught in the gap it opens above it. The
        # bottom, not the top — the slab above already carries the quilt+letter, and a second
        # "something's spilling out" beat up there would compete with them for the same real
        # estate; the bottom drawer has nothing else near it.
        ajar = 3 if i == 2 else 0
        orig_dy0 = dy0
        dy0 += ajar
        dy1 += ajar
        d.rectangle((left + 8, dy0, right - 8, dy1), fill=sh)
        d.rectangle((left + 8, dy0, right - 8, dy0 + 3), fill=_mix(sh, hi, 0.4))
        d.rectangle((left + 8, dy1 - 3, right - 8, dy1), fill=deep)
        pull_y = (dy0 + dy1) // 2
        for px in (left + (right - left) * 0.32, left + (right - left) * 0.68):
            d.ellipse((px - 4, pull_y - 4, px + 4, pull_y + 4), fill=GOLD)
            d.ellipse((px - 4, pull_y - 4, px + 1, pull_y + 1), fill=_mix(GOLD, PARCHMENT, 0.5))
        if ajar:
            # A small triangular wedge poking from the gap — reuses the quilt's own blue-family
            # tone (q_hi/q_base/q_sh, already computed above for the quilt drape) rather than a
            # new colour, reading as a bit of the same "junk drawer" cloth caught in the front.
            wx = left + (right - left) * 0.5
            wtop, wbot = orig_dy0 - 1, dy0 + 8
            d.polygon([(wx - 9, wbot), (wx + 9, wbot), (wx, wtop)], fill=q_base, outline=q_sh)
            d.line((wx - 9, wbot, wx, wtop), fill=q_hi)

    # Short plinth feet.
    for fx in (left + 6, right - 18):
        d.rectangle((fx, bottom, fx + 12, bottom + round(h * 0.06)), fill=deep)
    return img


# A small roaming animal — a hen, pecking around the floor (2l.1 — a farmhouse-appropriate
# companion to the cat by the fireplace, deliberately a different species so the two don't read
# as duplicates of each other). Same two-frame "idle" technique as make_cat_frames: not a gait,
# just enough motion (the head dips to peck) to read as alive rather than a decal.
def make_chicken_frames(count=3, w=76, h=60):
    """A hen. Frame 2 dips the head down as if pecking at the floor; frame 3 lifts and cocks
    it — an alert head-tilt between pecks. The body stays put throughout, the same "swell, not
    a gait" restraint make_cat_frames uses for the cat's breathing."""
    frames = []
    shadow = contact_shadow(round(w * 0.7), round(h * 0.16), max_alpha=100)
    body_hi, body, body_sh, _ = ramp(DIAMOND_BODY)
    for i in range(count):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.paste(shadow, (round(w * 0.14), h - round(h * 0.18)), shadow)
        d = ImageDraw.Draw(img)
        # Per-frame head offset: idle, peck-down, then a cocked-up-and-back "alert" tilt — not
        # a linear extension of the peck (which would just be a deeper peck), a distinct beat.
        hdx, hdy = ((0, 0), (0, round(h * 0.12)), (-round(w * 0.06), -round(h * 0.10)))[i]

        # Body: one round-backed oval, tail feathers a small triangle at the back.
        bx0, by0, bx1, by1 = round(w * 0.12), round(h * 0.30), round(w * 0.78), h - round(h * 0.16)
        d.ellipse((bx0, by0, bx1, by1), fill=body)
        d.ellipse((bx0, by0, bx1, by0 + round((by1 - by0) * 0.45)), fill=body_hi)
        d.polygon([(bx0 + 4, by0 + round((by1 - by0) * 0.3)), (bx0 - round(w * 0.14), by0 - 2),
                    (bx0 + 4, by0 + round((by1 - by0) * 0.7))], fill=body_sh)

        # Head: a smaller circle out front, dropping toward the ground on the peck frame or
        # cocked up and back on the alert-tilt frame.
        hr = round(h * 0.22)
        hx, hy = bx1 - round(w * 0.10) + hdx, by0 + round(h * 0.06) + hdy
        d.ellipse((hx - hr, hy - hr, hx + hr, hy + hr), fill=body_hi)
        # Comb and beak. On the tilt frame the comb's apex leans sideways instead of sitting
        # centred, offset from its "peck down" symmetric shape to sell the head cocking.
        comb_lean = 5 if i == 2 else 0
        d.polygon([(hx - 4, hy - hr), (hx + comb_lean, hy - hr - 6), (hx + 4, hy - hr)], fill=RED)
        d.polygon([(hx + hr - 2, hy - 2), (hx + hr + 7, hy + 2), (hx + hr - 2, hy + 6)], fill=GOLD)

        # Two thin legs.
        for lx in (bx0 + round((bx1 - bx0) * 0.35), bx0 + round((bx1 - bx0) * 0.62)):
            d.line((lx, by1 - 4, lx, by1 + round(h * 0.14)), fill=GOLD, width=3)
        frames.append(img)
    return frames


# Scattered feed on the floor beside the hen (creative-direction pass). Deliberately its OWN
# static image rather than a few dots painted into `make_chicken_frames`: that sprite sheet is
# a two-frame strip clipped by `.scene-chicken`'s own `overflow: hidden` (the box it slides
# behind for the peck-cycle animation), so anything baked into it would be cropped to the
# hen's own small bounding box along with the strip. A separate element sits in its own,
# independently-sized box instead.
def make_feed_dots(w=48, h=20):
    """A fixed, hand-placed scatter of small seed dots — arithmetic coordinates, not `random`,
    so the layout is exactly reproducible run to run. Flat-shaded (no ramp/shading): at this
    file size there is no room for a highlight to read as anything but noise.

    Radius 3 (not the original 2): at radius 2 every dot snapped to a single 2x2 file-pixel
    cell on the PX*chunk=4 authoring grid, which read fine at --px:2 (4 screen px) but
    collapsed to ~2 real screen pixels at --px:1 — invisible against the floor. Radius 3
    guarantees at least a 2x4 file-pixel cell per dot (most land 4x4), doubling the minimum
    on-screen footprint at --px:1 while staying a small, distinct speck rather than a blob at
    --px:2 (verified live at both 768x1024 and 1440x900)."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    dots = (
        (5, 11, GOLD), (14, 5, RUG_CREAM), (23, 13, GOLD),
        (31, 6, RUG_CREAM), (39, 12, GOLD), (10, 16, RUG_CREAM),
    )
    for x, y, color in dots:
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)
    return img


# --- The unit: true-resolution output (Phase 2f.1) ---------------------------------------- #
# Every asset is authored on the PX grid (above) and then SAVED AT ITS TRUE RESOLUTION —
# file size divided by PX. This is lossless by construction: a grid-snapped image has no
# detail finer than PX, so halving it throws nothing away (verified across all 26 card and
# portrait assets before the change: 26/26 byte-identical after round-tripping).
#
# **Why this matters more than it looks.** We were storing 50x70 art in a 100x140 file and
# calling that "1:1 native, pixels stay crisp". Because the file was twice its real
# resolution, the UI could — and did — render it at 0.25x and 0.6x while looking superficially
# fine, and those fractional scales silently deformed the art: 0.6x dropped pixel rows
# irregularly and visibly bent the Old-Timer's moustache; 0.25x discarded 80% of the card
# back's lattice. Once the file IS the true resolution, any non-integer scale is immediately
# obvious both to the eye and to scripts/scale-audit.js.
#
# Applied to EVERYTHING with no exceptions list. The scene sprites were previously never
# snapped at all, which meant the world was drawn on a finer grid than the cards sitting on
# it — the room read as higher-resolution than the game. One grid, one unit, one rule.


# How many art pixels wide a drawn feature must be, per asset class. `chunk=1` keeps the
# original grid; `chunk=2` means the smallest possible detail in the saved file is a 2x2
# block, which at --px 2 renders as **4 screen pixels** — the apparent pixel size the
# Stardew/Pokemon references actually use. This game shipped at 2, which is the literal
# measurement behind "it doesn't look pixelated": the art was correct, and simply too fine.
#
# CARDS DELIBERATELY STAY AT chunk=1. A rank index and a suit pip have to stay readable at the
# 25x35 seat size, and there is no room to spend half the available resolution there. That is
# not an inconsistency — ASSETS.md already states "a smaller card is different ART, not the
# same art scaled down", and the same logic applies to how coarse a grid each class can wear.
#
# ORDERING MATTERS, and it is the opposite of the intuitive one. Coarsening BEFORE the
# shading is quantised makes things worse, not better: test-coarsening the pre-2g.1 Old-Timer
# dropped him only 361 -> 245 colours, because each larger block still carried its own unique
# tint, so the result was big blocks of subtly-different colour, i.e. visible banding. Quantise
# the light first (2g.1), then coarsen. Never the reverse.
CHUNK_ENV = 2


def save_asset(img: Image.Image, path: str, label: str = "", chunk: int = 1) -> None:
    """Snap to the PX*chunk grid, prove it, halve to true resolution, write."""
    grid = PX * chunk
    img = snap_to_pixel_grid(img, grid)
    _assert_pixel_grid(img, grid, label=label or os.path.basename(path))
    w, h = img.size
    img.resize((w // PX, h // PX), Image.NEAREST).save(path)


def _median_lightness(img: Image.Image) -> float:
    px = [p for p in img.convert("RGBA").getdata() if p[3] > 0]
    ls = sorted(colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[1] * 100 for r, g, b, _ in px)
    return ls[len(ls) // 2]


# The room must read back-to-front: wall furthest away and darkest, then the floor, then the
# lit table the cards sit on. ASSETS.md has specified this order since Phase 2d — and said, in
# as many words, that it was "asserted BY EYE at full size". It was wrong by a factor of three
# and stayed wrong for four phases: the shipped tiles measured L 13.7 / 19.8 / 23.7 against a
# documented 33 / 54 / 62, so the three largest surfaces in the game sat inside ten lightness
# points of each other and the room read as one dark slab.
#
# An invariant that is only ever checked by eye is not an invariant. This is the same argument
# as `_assert_pixel_grid` and `_assert_art_clear_of_indices`, both of which caught real bugs
# that visual review had already passed.
VALUE_LADDER_MIN_GAP = 6.0


def _assert_value_ladder(tiles: "dict[str, Image.Image]") -> None:
    order = ["wall", "floor", "table"]
    values = [(n, _median_lightness(tiles[n])) for n in order]
    for (n_a, l_a), (n_b, l_b) in zip(values, values[1:]):
        if l_b - l_a < VALUE_LADDER_MIN_GAP:
            raise AssertionError(
                f"value ladder broken: {n_a} L={l_a:.1f} -> {n_b} L={l_b:.1f} "
                f"(gap {l_b - l_a:.1f} < {VALUE_LADDER_MIN_GAP}). The room needs "
                f"back-to-front value separation to read as a room."
            )
    print("  value ladder: " + " -> ".join(f"{n} L{v:.1f}" for n, v in values))


# A sprite carrying hundreds of near-identical tones is not shaded, it is airbrushed. The
# shipped Old-Timer measured **361 colours** on one 150x140 sprite — roughly fifty skin tones
# inside four RGB units of each other — because `light_from` tinted every column
# independently. Stardew-class character sprites carry 12-25 colours in total. Banding the
# light (see `light_from`) took the same sprite to ~36; this ceiling is what stops a future
# continuous gradient from quietly reintroducing the problem, since the symptom is invisible
# in a diff and easy to miss by eye.
SPRITE_COLOUR_CEILING = 64


def _assert_sprite_colours(img: Image.Image, label: str) -> None:
    n = len({p for p in img.convert("RGBA").getdata() if p[3] > 0})
    if n > SPRITE_COLOUR_CEILING:
        raise AssertionError(
            f"{label} has {n} distinct colours (ceiling {SPRITE_COLOUR_CEILING}). "
            f"That is gradient noise, not shading — check for an unbanded light pass."
        )


def main() -> None:
    cards_dir = os.path.join(OUT_ROOT, "cards")
    os.makedirs(cards_dir, exist_ok=True)

    for suit in SUITS:
        for rank in RANKS:
            card = make_face_card(rank, suit) if rank in FACE_RANKS else make_number_card(rank, suit)
            save_asset(card, os.path.join(cards_dir, f"{suit}_{rank}.png"), f"{suit}_{rank}")

    save_asset(make_gear_icon(), os.path.join(OUT_ROOT, "gear.png"), "gear")
    save_asset(make_dealer_chip(), os.path.join(OUT_ROOT, "dealer_chip.png"), "dealer_chip")
    save_asset(make_card_back(), os.path.join(OUT_ROOT, "card_back.png"))
    # Drawn at the scoreboard card's own size (30x42 au) rather than reusing the deck's back,
    # which would have to render at 1.2x to fit — see make_card_back's docstring.
    save_asset(
        make_card_back(SCORE_CARD_W, SCORE_CARD_H, step=10),
        os.path.join(OUT_ROOT, "score_card_back.png"),
    )
    # A hand resting on the table is drawn SMALLER than the one you are holding, and smaller
    # pixel art is redrawn, not shrunk. 50x70 for a seat fan crowded the table badly at 390px;
    # 25x35 is the size that composition actually wants, and rendering the deck's back into it
    # would be 0.5x — the exact fault this phase removes.
    save_asset(
        make_card_back(CARD_W // 2, CARD_H // 2, step=8),
        os.path.join(OUT_ROOT, "card_back_seat.png"),
    )
    felt, wall, floor = make_table_felt(), make_wall_texture(), make_floorboards()
    # Checked here, not by eye at full size — see _assert_value_ladder for why that distinction
    # is the whole point.
    _assert_value_ladder({"wall": wall, "floor": floor, "table": felt})
    # chunk=CHUNK_ENV on every environment asset from here down: the room wears a grid twice
    # as coarse as the cards, which is what puts its apparent pixel at Stardew's size. Cards
    # keep chunk=1 — see the CHUNK_ENV comment for why that is a decision, not an oversight.
    save_asset(felt, os.path.join(OUT_ROOT, "table_felt.png"), chunk=CHUNK_ENV)
    save_asset(wall, os.path.join(OUT_ROOT, "wall_texture.png"), chunk=CHUNK_ENV)

    scene_dir = os.path.join(OUT_ROOT, "scene")
    os.makedirs(scene_dir, exist_ok=True)
    save_asset(make_fireplace(), os.path.join(scene_dir, "fireplace.png"), chunk=CHUNK_ENV)
    save_asset(make_chimney_tile(), os.path.join(scene_dir, "chimney_tile.png"), chunk=CHUNK_ENV)
    save_asset(make_sprite_sheet(make_fire_frames()),
               os.path.join(scene_dir, "fire_sheet.png"), chunk=CHUNK_ENV)
    save_asset(make_window_glass(), os.path.join(scene_dir, "window_glass.png"), chunk=CHUNK_ENV)
    save_asset(make_window_frame(), os.path.join(scene_dir, "window_frame.png"), chunk=CHUNK_ENV)
    save_asset(light_from(make_window_sill(), strength=0.13),
               os.path.join(scene_dir, "window_sill.png"), chunk=CHUNK_ENV)
    save_asset(make_snowfall(), os.path.join(scene_dir, "snow.png"), chunk=CHUNK_ENV)
    save_asset(floor, os.path.join(scene_dir, "floor.png"), chunk=CHUNK_ENV)
    # Lit like the fireplace/window it sits between, not left neutral — a rug directly in the
    # hearth's light shouldn't be the one object in the room untouched by it.
    save_asset(light_from(make_rug(), strength=0.12),
               os.path.join(scene_dir, "rug.png"), chunk=CHUNK_ENV)
    # A worn patch in front of the player's own seat (2m.1) — its own placed asset, same
    # convention as the rug above, not baked into the floor tile (see make_floor_patch()).
    save_asset(light_from(make_floor_patch(), strength=0.12),
               os.path.join(scene_dir, "floor_patch.png"), chunk=CHUNK_ENV)
    # Everything in the room is lit by the hearth, which sits in the LEFT margin. Applied here
    # rather than inside each generator so the light model is stated once, in one place, and
    # so it demonstrably cannot reach the card art. The fireplace and the window are their own
    # light sources and are deliberately excluded.
    # The opponent sits ACROSS THE TABLE now (2f.3), rendered by Table.tsx behind the felt,
    # not as ambient room decor in the side margin — so he is no longer a scene/ asset.
    # Every sprite below goes through light_from, which is exactly what the colour ceiling
    # guards — an unbanded light pass is invisible in a diff and easy to pass by eye.
    # On the coarse grid with the rest of the room as of 2g.5 — his features are now authored
    # as grid-aligned rectangles rather than ellipses that had to survive quantisation, which
    # is what forced the temporary fine-grid exception in 2g.2.
    # `blink` is a fourth file, not a sprite-sheet frame: a blink is ~150ms every few seconds,
    # and a steps() sheet gives every frame an equal slice, so matching that duty cycle would
    # have meant ~20 near-identical frames. A timer swapping one image is smaller and gives
    # exact control over both the interval and the duration.
    #
    # Four characters now, not one: online you see whichever your OPPONENT picked, and both
    # players being the Old-Timer was the thing that made a named human still look like him.
    # The colour assert runs per character — each gets its own SPRITE_COLOUR_CEILING budget,
    # and a character that busts it should fail loudly here rather than ship as gradient mush.
    for key, av in AVATARS.items():
        for expression in ("idle", "happy", "rueful", "blink"):
            sprite = make_avatar(av, expression)
            _assert_sprite_colours(sprite, f"avatar {key} {expression}")
            save_asset(sprite, os.path.join(OUT_ROOT, f"avatar_{key}_{expression}.png"),
                       f"avatar {key} {expression}", chunk=CHUNK_ENV)
    cat = light_from(make_sprite_sheet(make_cat_frames()), strength=0.13)
    _assert_sprite_colours(cat, "cat sheet")
    save_asset(cat, os.path.join(scene_dir, "cat_sheet.png"), chunk=CHUNK_ENV)
    shelf = light_from(make_shelf(), strength=0.13)
    _assert_sprite_colours(shelf, "shelf")
    save_asset(shelf, os.path.join(scene_dir, "shelf.png"), chunk=CHUNK_ENV)
    # A second small animal (2l.1), same technique as the cat: two-frame idle sheet, hearth-lit.
    chicken = light_from(make_sprite_sheet(make_chicken_frames()), strength=0.13)
    _assert_sprite_colours(chicken, "chicken sheet")
    save_asset(chicken, os.path.join(scene_dir, "chicken_sheet.png"), chunk=CHUNK_ENV)

    # Wall and floor furniture (2g.4). Same hearth-side lighting as everything else in the
    # room, at the same modest strengths — an object that skips light_from is the one that
    # gives away that the room's light is painted rather than modelled.
    for name, sprite in (
        ("picture", make_framed_picture()),
        # Height 352 -> 240 raw (176 -> 120au) — the felt-notch fix's art half, see
        # `.scene-farm-painting`'s own CSS comment. A genuinely re-rendered canvas at the new
        # height, not the PNG squeezed into a shorter CSS box — the fractional-scale bug this
        # exists to avoid (`npm run audit` caught a first CSS-only attempt at this: 240/176 =
        # 1.364x, not a whole number). `make_farm_painting()` draws every element as a fraction
        # of its own `w`/`h` (see its own docstring), so a shorter canvas re-composes rather
        # than stretches. The separate `farm_painting_small` asset that used to live here (a
        # smaller render for a narrower viewport band) is gone — `.scene-farm-painting` now
        # fills its own box fluidly via CSS (`left`/`right`, no fixed `width`), so one asset
        # covers the width range two used to.
        ("farm_painting", make_farm_painting(700, 240)),
        ("clock", make_wall_clock()),
        ("coat_hooks", make_coat_hooks()),
        ("woodpile", make_woodpile()),
        ("hearth_mat", make_hearth_mat()),
        # 96x64 -> 144x96au (1.5x, same ratio) — direct user feedback: "the dresser under the
        # window is SO small." A real re-render at the new size (make_dresser() draws almost
        # everything as a fraction of its own w/h), not a CSS stretch of the old asset, for the
        # same whole-number-scale reason every other art resize in this file gives.
        ("dresser", make_dresser(288, 192)),
        # Two small static props (creative-direction pass): a yarn ball beside the cat and a
        # scatter of feed dots beside the hen. Same loop as the furniture above — flat-shaded,
        # single static image, no sprite-sheet frames — even though these two sit beside
        # ANIMALS rather than furniture, because neither one itself moves.
        ("yarn_ball", make_yarn_ball()),
        ("feed_dots", make_feed_dots()),
        # A dropped card near the floor patch (wave-2 3m.3) — same loop, same flat-shaded/
        # single-static-image treatment, sharing the floor patch's own narrow visibility
        # window rather than the yarn ball/feed dots' always-on one (see make_dropped_card()
        # and .scene-floor-card's own comments for why).
        ("dropped_card", make_dropped_card()),
    ):
        lit = light_from(sprite, strength=0.13)
        _assert_sprite_colours(lit, name)
        save_asset(lit, os.path.join(scene_dir, f"{name}.png"), name, chunk=CHUNK_ENV)

    # NOT run through save_asset: these are consumed by the OS at the exact sizes declared
    # in the manifest and <link rel="icon">, so they are output at nominal size, not au.
    for icon_size in (32, 192, 512):
        make_app_icon(icon_size).save(os.path.join(OUT_ROOT, f"icon-{icon_size}.png"))

    suits_dir = os.path.join(OUT_ROOT, "suits")
    os.makedirs(suits_dir, exist_ok=True)
    for suit in SUITS:
        save_asset(make_suit_icon(suit), os.path.join(suits_dir, f"{suit}.png"), f"suit {suit}")

    # Only the suits SCORE_SUIT actually assigns (src/ui/Scoreboard.tsx: A -> hearts,
    # B -> spades) get scoreboard cards — generating all four was dead weight, since each
    # player's suit is currently fixed, not a real choice yet (see that file's comment). If
    # per-player suit choice becomes a real setting, add suits here to match.
    SCOREBOARD_SUITS = ("hearts", "spades")
    score_dir = os.path.join(OUT_ROOT, "scoreboard")
    os.makedirs(score_dir, exist_ok=True)
    for suit in SCOREBOARD_SUITS:
        for rank in ("4", "6"):
            save_asset(make_scoreboard_card(rank, suit), os.path.join(score_dir, f"{suit}_{rank}.png"))

    # Emitted so the "MUST MATCH" comment on Scoreboard.tsx's CARD_H/PIP_Y0/PIP_Y1 is a checked
    # fact instead of a promise (2h.2) — tests/scoreboardGeometry.test.ts reads this file and
    # compares it against the TS constants directly. Not written into public/art/: it is not a
    # game asset, just a build-time contract between this generator and that one component, so
    # it lives beside the generator instead of shipping to players.
    art_dir = os.path.dirname(__file__)
    with open(os.path.join(art_dir, "scoreboard-geometry.generated.json"), "w") as f:
        json.dump(
            {"CARD_H": SCORE_CARD_H, "PIP_Y0": SCORE_PIP_Y0, "PIP_Y1": SCORE_PIP_Y1},
            f,
            indent=2,
        )
        f.write("\n")

    print(
        f"Generated {len(SUITS) * len(RANKS)} card faces + card back + table felt "
        f"+ {len(SUITS)} suit icons + {len(SCOREBOARD_SUITS) * 2} scoreboard cards -> {OUT_ROOT}"
    )


if __name__ == "__main__":
    main()
