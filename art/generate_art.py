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


def _opponent_parts():
    """Head, hat and shoulders at across-the-table size — same flannel, same trapper hat, same
    moustache the standalone portrait used to draw (deleted in 2h.1; see the note above),
    deliberately redrawn at this size rather than scaled up from a smaller original, because
    scaling pixel art is the one thing this project forbids."""
    hy = OPP_HEAD_CY
    return [
        # Shoulders/chest, running off the bottom of the canvas — the felt crops it.
        (_poly([
            (OPP_CX - 96, hy + 74), (OPP_CX - 62, hy + 52), (OPP_CX + 62, hy + 52),
            (OPP_CX + 96, hy + 74), (OPP_CX + 112, OPP_H), (OPP_CX - 112, OPP_H),
        ]), FLANNEL_RED),
        # A darker placket so the chest is not one flat red mass at this size.
        (_poly([
            (OPP_CX - 12, hy + 56), (OPP_CX + 12, hy + 56),
            (OPP_CX + 16, OPP_H), (OPP_CX - 16, OPP_H),
        ]), BOOT_DARK),
        # Forearms and hands, resting on the table (2g.5). He was a floating BUST: shoulders
        # that simply stopped, no arms, no hands, no contact with the furniture in front of
        # him. Every other object in this room got grounded during Phase 2f and 2g — the table
        # got legs and a contact shadow, the cat got a shadow, the rug got the table standing
        # on it — while the one PERSON hovered. These come in from the lower corners and angle
        # toward where his two card fans actually sit, so he reads as holding them.
        # Sleeves get a DARKER flannel than the chest. Drawn in the same FLANNEL_RED they were
        # invisible against the body behind them, so all that showed were two skin ovals
        # floating on his chest, reading unmistakably as buttons. An arm needs an edge.
        (_poly([
            (OPP_CX - 118, OPP_H), (OPP_CX - 94, hy + 74),
            (OPP_CX - 58, hy + 94), (OPP_CX - 62, OPP_H),
        ]), ramp(FLANNEL_RED)[2]),
        (_poly([
            (OPP_CX + 118, OPP_H), (OPP_CX + 94, hy + 74),
            (OPP_CX + 58, hy + 94), (OPP_CX + 62, OPP_H),
        ]), ramp(FLANNEL_RED)[2]),
        # Hands: squared-off, not round. A circle of skin reads as a ball; knuckles and a
        # thumb read as a hand even at eight pixels across.
        (_poly([
            (OPP_CX - 88, hy + 92), (OPP_CX - 52, hy + 84), (OPP_CX - 44, hy + 100),
            (OPP_CX - 52, hy + 118), (OPP_CX - 84, hy + 116),
        ]), SKIN),
        (_poly([
            (OPP_CX + 88, hy + 92), (OPP_CX + 52, hy + 84), (OPP_CX + 44, hy + 100),
            (OPP_CX + 52, hy + 118), (OPP_CX + 84, hy + 116),
        ]), SKIN),
        # Neck, behind the head so the jaw reads as sitting on it.
        (_poly([
            (OPP_CX - 26, hy + 34), (OPP_CX + 26, hy + 34),
            (OPP_CX + 30, hy + 60), (OPP_CX - 30, hy + 60),
        ]), SKIN),
        (_ellipse(OPP_CX - OPP_HEAD_RX, hy - OPP_HEAD_RY,
                  OPP_CX + OPP_HEAD_RX, hy + OPP_HEAD_RY), SKIN),
        # Moustache, before the hat so the brim can overlap the hairline.
        (_poly([
            (OPP_CX - 48, hy + 20), (OPP_CX - 10, hy + 10), (OPP_CX, hy + 17),
            (OPP_CX + 10, hy + 10), (OPP_CX + 48, hy + 20),
            (OPP_CX + 38, hy + 34), (OPP_CX, hy + 25), (OPP_CX - 38, hy + 34),
        ]), BEARD_GRAY),
        # Trapper hat. Crown kept well clear of the brow line (drawn at hy-24 in the face pass)
        # — the portrait once had the brim landing exactly on the eyebrows and every
        # expression collapsed into a single grey stripe.
        (_poly([
            (OPP_CX - 58, hy - 52), (OPP_CX - 58, hy - 80), (OPP_CX, hy - 96),
            (OPP_CX + 58, hy - 80), (OPP_CX + 58, hy - 52),
        ]), CAP_GREEN),
        (_ellipse(OPP_CX - 72, hy - 48, OPP_CX - 38, hy - 4), HAT_FUR),
        (_ellipse(OPP_CX + 38, hy - 48, OPP_CX + 72, hy - 4), HAT_FUR),
        (_poly([
            (OPP_CX - 60, hy - 58), (OPP_CX + 60, hy - 58),
            (OPP_CX + 60, hy - 44), (OPP_CX - 60, hy - 44),
        ]), HAT_FUR),
    ]


def draw_opponent_face(img: Image.Image, expression: str) -> None:
    """The Old-Timer's face. Four states, sharing `useOpponentExpression`'s existing
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
    hy = OPP_HEAD_CY
    eye_y = hy - 8
    skin_hi, _, skin_sh, skin_deep = ramp(SKIN)

    # --- Modelling, under the features. Warm light from the left (hearth), so the right side
    # of the face carries the shadow — consistent with light_from's direction. ---
    # Cheekbone and jaw shadow down the shaded side.
    d.polygon([(OPP_CX + 20, hy - 20), (OPP_CX + 52, hy - 28), (OPP_CX + 56, hy + 16),
               (OPP_CX + 28, hy + 40), (OPP_CX + 16, hy + 24)], fill=skin_sh)
    # Brow ridge: the face's strongest form, and what makes a head read as bone rather than egg.
    d.rectangle((OPP_CX - 48, eye_y - 20, OPP_CX + 48, eye_y - 12), fill=skin_sh)
    d.rectangle((OPP_CX - 48, eye_y - 24, OPP_CX + 48, eye_y - 20), fill=skin_hi)
    # Nose: a lit ridge with its own shadow to the right, and a nostril line under it. It STOPS
    # ABOVE THE MOUSTACHE (which `_opponent_parts` draws from hy+10) — the first pass ran it to
    # hy+12 and split the moustache in half with a skin-coloured bar straight down the middle.
    d.rectangle((OPP_CX - 4, eye_y - 8, OPP_CX + 4, hy + 4), fill=skin_hi)
    d.rectangle((OPP_CX + 4, eye_y - 4, OPP_CX + 12, hy + 4), fill=skin_sh)
    d.rectangle((OPP_CX - 8, hy, OPP_CX + 12, hy + 4), fill=skin_deep)
    # Age lines — the whole point of a character called the Old-Timer. Crow's feet only: the
    # nasolabial folds this originally also carried ran straight through the moustache, and
    # the brow ridge, cheekbone and crow's feet already do the work. Kept to 4px marks, since
    # a wrinkle drawn thinner than the grid is noise rather than detail.
    for side in (-1, 1):
        tx = OPP_CX + side * 44
        for dy in (-8, 0, 8):
            x0, x1 = sorted((tx, tx + side * 12))
            d.rectangle((x0, eye_y + dy, x1, eye_y + dy + 4), fill=skin_sh)

    # --- Features. Rectangles, on the grid. ---
    for side in (-1, 1):
        ex = OPP_CX + side * 24
        if expression == "happy":
            # Closed-and-creased: a flat bar with a lift at the outer end.
            d.rectangle((ex - 12, eye_y, ex + 12, eye_y + 4), fill=INK)
            hx0, hx1 = sorted((ex + side * 12, ex + side * 16))
            d.rectangle((hx0, eye_y - 4, hx1, eye_y), fill=INK)
        elif expression == "blink":
            d.rectangle((ex - 12, eye_y - 4, ex + 12, eye_y), fill=INK)
        else:
            d.rectangle((ex - 8, eye_y - 12, ex + 8, eye_y + 8), fill=INK)
            d.rectangle((ex - 8, eye_y - 12, ex - 4, eye_y - 8), fill=(255, 255, 255, 255))
        # Eye socket shadow, so the eye sits IN the head rather than on it.
        d.rectangle((ex - 12, eye_y + 8, ex + 12, eye_y + 12), fill=skin_sh)

    by = eye_y - 24
    for side in (-1, 1):
        x_out, x_in = OPP_CX + side * 44, OPP_CX + side * 12
        if expression == "rueful":
            d.line((x_out, by - 8, x_in, by + 4), fill=BEARD_GRAY, width=8)
        elif expression == "happy":
            d.line((x_out, by + 4, x_in, by - 4), fill=BEARD_GRAY, width=8)
        else:
            d.line((x_out, by, x_in, by), fill=BEARD_GRAY, width=8)

    my = hy + 40
    if expression == "happy":
        d.rectangle((OPP_CX - 20, my, OPP_CX + 20, my + 8), fill=INK)
        for side in (-1, 1):
            mx0, mx1 = sorted((OPP_CX + side * 20, OPP_CX + side * 24))
            d.rectangle((mx0, my - 8, mx1, my), fill=INK)
    elif expression == "rueful":
        d.rectangle((OPP_CX - 16, my + 8, OPP_CX + 16, my + 12), fill=INK)
        for side in (-1, 1):
            mx0, mx1 = sorted((OPP_CX + side * 16, OPP_CX + side * 20))
            d.rectangle((mx0, my, mx1, my + 8), fill=INK)


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


def make_opponent(expression: str) -> Image.Image:
    img = Image.new("RGBA", (OPP_W, OPP_H), (0, 0, 0, 0))
    paste(img, composite_sprite(OPP_W, OPP_H, _opponent_parts(), outline_px=4, pad=6), 0, 0)
    # Buffalo check, not a flat coat — see the FLANNEL_RED/HAT_FUR note above. BOOT_DARK is
    # already in this sprite's palette (the chest placket), so this adds no new base colour.
    _buffalo_check(img, FLANNEL_RED, BOOT_DARK, 16)
    draw_opponent_face(img, expression)
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
    d.rectangle((ox0, oy0, ox1, oy1), outline=_mix(mortar, deep, 0.6), width=lip)
    d.line((ox0 + lip, oy0 + lip, ox1 - lip, oy0 + lip), fill=_mix(deep, FIRE_DEEP, 0.45))

    # Timber mantel, overhanging the stone on both sides.
    m_hi, m_base, m_sh, m_deep = ramp(TABLE_WOOD)
    mantel = round(h * 0.107)
    m_lip = max(2, round(h * 0.022))
    d.rectangle((0, body_top - mantel, w - 1, body_top + m_lip), fill=m_base)
    d.rectangle((0, body_top - mantel, w - 1, body_top - mantel + m_lip * 2), fill=m_hi)
    d.line((0, body_top - m_lip, w - 1, body_top - m_lip), fill=m_sh)
    d.line((0, body_top + m_lip, w - 1, body_top + m_lip), fill=m_deep)
    return img


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
    return img


# 372x24 canvas -> 186x12 au: 16au wider than the window itself (8au overhang each side), the
# same "sash sits inside a slightly wider ledge" relationship a real windowsill has. A separate
# asset rather than folded into make_window_frame: the frame is stretched to `background-size:
# 100% 100%` over whatever box `.scene-window` is, so adding a ledge inside that same image
# would stretch WITH the window every time its box resizes, rather than staying a fixed-height
# strip under it.
def make_window_sill(w=372, h=24):
    """A plain wood ledge sitting under the window, firelit like the sash it belongs to."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(TABLE_WOOD)

    d.rectangle((0, 0, w - 1, h - 1), fill=base)
    d.line((0, 0, w - 1, 0), fill=hi)
    d.rectangle((0, h - 6, w - 1, h - 1), fill=deep)
    d.line((0, h - 6, w - 1, h - 6), fill=sh)
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


def make_cat_frames(count=2, w=252, h=160):
    """A cat asleep by the fire, two frames of slow breathing.

    Two frames is enough because the motion is a swell, not a gait — the body rises a pixel.
    Animated slowly that reads as breathing; more frames would add nothing perceptible here.

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
        rise = i
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
        paste(img, composite_sprite(w, h, parts), 0, 0)
        d = ImageDraw.Draw(img)
        # Closed eyes — two short lines. He is asleep; that is the whole character note.
        for ex in (w - round(w * 0.23), w - round(w * 0.13)):
            d.line((ex, body_top + round(h * 0.11), ex + round(w * 0.07), body_top + round(h * 0.11)),
                   fill=INK, width=2)
        frames.append(img)
    return frames


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

    d.rectangle((0, 0, w - 1, h - 1), fill=base)
    # Woven border: a cream band inset from the edge, then a thin deep line inside that —
    # the two-band border every real woven rug has, not just a solid-colour rectangle.
    inset = 10
    d.rectangle((inset, inset, w - 1 - inset, h - 1 - inset), outline=cream, width=4)
    d.rectangle((inset + 8, inset + 8, w - 9 - inset, h - 9 - inset), outline=deep, width=2)

    # A soft diagonal weave texture in the field, fixed arithmetic so it stays reproducible.
    seed = 3
    for y in range(inset + 14, h - inset - 14, 6):
        x = -(seed % 12)
        while x < w:
            tone = hi if (seed // 5) % 2 else sh
            d.line((x, y, x + 8, y), fill=_mix(base, tone, 0.35))
            x += 16
            seed += 7

    # Fringe along the two short ends, the detail that most reads as "woven rug" rather than
    # "coloured rectangle".
    for fx in range(4, w - 4, 7):
        d.line((fx, 0, fx, 3), fill=cream)
        d.line((fx, h - 4, fx, h - 1), fill=cream)
    return img


def make_shelf(w=300, h=160):
    """A wall shelf with clutter — jars, books, a lantern. Placed once, never tiled, so unlike
    the wall texture it may carry all the distinctive point detail it likes.

    2j.3: resized 2.5x (120x64 -> 300x160). Every offset below is the original times 2.5."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(TABLE_WOOD)

    plank_y = h - 30
    d.rectangle((0, plank_y, w - 1, plank_y + 15), fill=base)
    d.line((0, plank_y, w - 1, plank_y), fill=hi)
    d.line((0, plank_y + 15, w - 1, plank_y + 15), fill=deep)
    for bx in (25, w - 40):
        d.polygon([(bx, plank_y + 15), (bx + 15, plank_y + 15), (bx + 8, h - 1)], fill=sh)

    # Books, leaning. A fourth spine added in 2l.1 (direct user feedback: "fuller" shelf) —
    # same leaning-book draw call as the other three, just one more (bx, bh, col) tuple.
    for i, (bx, bh, col) in enumerate((
        (20, 65, RUG_RED), (40, 75, LEAF_GREEN), (60, 60, CLOTH_BLUE), (80, 50, STEEL),
    )):
        d.rectangle((bx, plank_y - bh, bx + 18, plank_y - 1), fill=col)
        d.rectangle((bx, plank_y - bh, bx + 18, plank_y - bh + 5), fill=_mix(col, GOLD, 0.5))

    # Jars.
    for jx, jh, fill in ((110, 50, _mix(LEAF_GREEN, PARCHMENT, 0.4)), (155, 40, _mix(RUG_RED, PARCHMENT, 0.5))):
        d.rectangle((jx, plank_y - jh, jx + 32, plank_y - 1), fill=fill)
        d.rectangle((jx, plank_y - jh, jx + 32, plank_y - jh + 8), fill=sh)
        d.line((jx, plank_y - jh + 13, jx + 32, plank_y - jh + 13), fill=_mix(fill, PARCHMENT, 0.5))

    # A small vase, 2l.1 — the one gap left on the plank, between the jars and the lantern.
    vx, vh = 193, 35
    d.polygon([(vx + 4, plank_y - vh), (vx + 14, plank_y - vh), (vx + 17, plank_y - 1),
               (vx + 1, plank_y - 1)], fill=_mix(RUG_RED, INK_LIGHT, 0.35))
    d.line((vx + 4, plank_y - vh, vx + 14, plank_y - vh), fill=_mix(GOLD, PARCHMENT, 0.4))

    # Lantern, with a lit pane.
    lx = 215
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
    """A small framed landscape — the most literal reading of "art on walls".

    Deliberately a DAYLIT scene: the one window in this room shows night, so a sunlit picture
    is the only warm-and-bright note available, and it gives the palette somewhere to put the
    greens and mid-blues that the environment's 42-degree warm arc otherwise has no room for.

    2j.3: resized 2.5x (96x72 -> 240x180). Every offset below is the original times 2.5."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f_hi, f_base, f_sh, f_deep = ramp(TABLE_WOOD)

    d.rectangle((0, 0, w - 1, h - 1), fill=f_base)
    d.rectangle((0, 0, w - 1, 3), fill=f_hi)
    d.rectangle((0, h - 5, w - 1, h - 1), fill=f_deep)

    # The painted field, inset inside the moulding.
    m = 20
    sky_hi, sky, sky_sh, _ = ramp(PICTURE_SKY, warm=False)
    d.rectangle((m, m, w - m - 1, h - m - 1), fill=sky)
    d.rectangle((m, m, w - m - 1, m + 20), fill=sky_hi)

    horizon = h - m - 50
    hill_hi, hill, hill_sh, hill_deep = ramp(LEAF_GREEN)
    # Two overlapping hills, the far one lighter, so the little scene has depth of its own.
    d.polygon([(m, horizon + 15), (m + 65, horizon - 30), (m + 135, horizon + 15)], fill=hill_hi)
    d.polygon([(m + 75, horizon + 20), (m + 145, horizon - 35), (w - m - 1, horizon + 20)], fill=hill)
    d.rectangle((m, horizon + 15, w - m - 1, h - m - 1), fill=hill_sh)
    d.line((m, horizon + 15, w - m - 1, horizon + 15), fill=hill_deep)
    # A low sun, the warm note the night room never gets.
    d.ellipse((m + 150, m + 20, m + 150 + 30, m + 50), fill=FIRE_CORE)
    return img


# A second, smaller frame for the same free wall column the antlers sit in (2l.1 — more art on
# the walls, direct user feedback). Not a resized copy of make_framed_picture: that function's
# hill/sun geometry is hand-placed in absolute pixels tuned for its 240x180 canvas specifically
# (the hill polygons alone would run off the right edge of a frame under half that width), and
# reworking it to scale proportionally risks nudging the shipped picture.png for no reason —
# picture.png isn't cards-frozen, but "don't touch what already works" still applies. A single
# tree silhouette is a plainer scene that is cheap to place correctly at a smaller size instead.
def make_framed_picture_small(w=120, h=112):
    """A small framed picture: one tree against a daylit sky. Same moulding technique as
    make_framed_picture (TABLE_WOOD frame, PICTURE_SKY field) — a second, smaller piece of art
    for the same wall, not a different kind of object."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f_hi, f_base, f_sh, f_deep = ramp(TABLE_WOOD)

    d.rectangle((0, 0, w - 1, h - 1), fill=f_base)
    d.rectangle((0, 0, w - 1, 2), fill=f_hi)
    d.rectangle((0, h - 4, w - 1, h - 1), fill=f_deep)

    m = 10
    sky_hi, sky, sky_sh, _ = ramp(PICTURE_SKY, warm=False)
    d.rectangle((m, m, w - m - 1, h - m - 1), fill=sky)
    d.rectangle((m, m, w - m - 1, m + round((h - 2 * m) * 0.2)), fill=sky_hi)

    ground_y = h - m - round((h - 2 * m) * 0.22)
    grass_hi, grass, grass_sh, grass_deep = ramp(LEAF_GREEN)
    d.rectangle((m, ground_y, w - m - 1, h - m - 1), fill=grass)
    d.line((m, ground_y, w - m - 1, ground_y), fill=grass_deep)

    # One tree: a trunk and a round canopy, centred over the ground band.
    cx = m + (w - 2 * m) // 2
    trunk_w = max(3, (w - 2 * m) // 14)
    d.rectangle((cx - trunk_w // 2, ground_y - round((h - 2 * m) * 0.18), cx + trunk_w // 2, ground_y),
                fill=darken(TABLE_WOOD, 0.6))
    r = round((w - 2 * m) * 0.24)
    cy = ground_y - round((h - 2 * m) * 0.30)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=grass_hi)
    d.ellipse((cx - r + 4, cy - r + 4, cx + r - 6, cy + r - 6), fill=grass)
    d.ellipse((cx - r // 3, cy - r // 3, cx + r // 3, cy + r // 3), fill=grass_sh)

    # A low sun, same warm note make_framed_picture uses.
    sr = max(4, round((w - 2 * m) * 0.09))
    sx, sy = w - m - sr - 6, m + sr + 4
    d.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=FIRE_CORE)
    return img


def make_antlers(w=120, h=80):
    """A mounted rack on a wooden plaque. Cabin shorthand, and the one object in the room with
    a genuinely irregular silhouette — every other thing here is a rectangle or an ellipse."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    p_hi, p_base, p_sh, p_deep = ramp(TABLE_WOOD)
    b_hi, bone, b_sh, b_deep = ramp(BEARD_GRAY)

    # Shield-shaped plaque. Wide, not narrow: the first pass made it ±22px against a rack
    # spanning ±50 and it read unmistakably as a plant pot with a dead twig in it. A mount
    # has to look like it could actually carry the thing bolted to it.
    cx, py = w // 2, h - 26
    d.polygon([(cx - 34, py), (cx + 34, py), (cx + 28, h - 5), (cx, h - 1), (cx - 28, h - 5)],
              fill=p_base)
    d.line((cx - 34, py, cx + 34, py), fill=p_hi)
    d.polygon([(cx - 27, py + 3), (cx + 27, py + 3), (cx + 22, h - 9), (cx, h - 6),
               (cx - 22, h - 9)], fill=p_sh)
    d.polygon([(cx - 8, py + 2), (cx + 8, py + 2), (cx + 6, py + 12), (cx - 6, py + 12)],
              fill=p_deep)

    # Widths roughly doubled from the first pass, which measured genuinely spindly at display
    # size — the tine tips in particular were a single floating pixel with nothing connecting
    # them to the beam visually. A real antler beam is a substantial, weight-bearing form, not
    # a wire; `d.ellipse` "burrs" at every joint round out where segments meet, since PIL's
    # line-width joints stay hard mitres otherwise and read as notches rather than one branch
    # splitting into another.
    def burr(x, y, r):
        d.ellipse((x - r, y - r, x + r, y + r), fill=bone)

    for side in (-1, 1):
        # Main beam, sweeping up and out.
        beam = [(cx + side * 4, py), (cx + side * 16, py - 18), (cx + side * 30, py - 30),
                (cx + side * 46, py - 34)]
        for (x0, y0), (x1, y1) in zip(beam, beam[1:]):
            d.line((x0, y0, x1, y1), fill=bone, width=9)
        for jx, jy in beam:
            burr(jx, jy, 5)
        # Tines off the beam.
        for (bx, by), (tx, ty) in (((cx + side * 16, py - 18), (cx + side * 12, py - 40)),
                                   ((cx + side * 30, py - 30), (cx + side * 30, py - 52)),
                                   ((cx + side * 42, py - 33), (cx + side * 50, py - 50))):
            d.line((bx, by, tx, ty), fill=bone, width=7)
            burr(bx, by, 4)
            burr(tx, ty, 4)
            d.line((tx, ty, tx + side * 2, ty - 3), fill=b_hi, width=5)
        d.line((cx + side * 4, py, cx + side * 16, py - 18), fill=b_sh, width=3)
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


def make_coat_hooks(w=208, h=268):
    """A hook rail with a coat hung on it. The one object here that implies a PERSON — someone
    came in out of the snow and hung their coat up — which is a different kind of warmth from
    the fire, and cheap to state.

    2j.3: resized ~2.48x (84x108 -> 208x268). Every offset below is the original times ~2.48."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r_hi, rail, r_sh, r_deep = ramp(TABLE_WOOD)
    c_hi, coat, c_sh, c_deep = ramp(COAT_GREEN)

    d.rectangle((0, 0, w - 1, 22), fill=rail)
    d.line((0, 0, w - 1, 0), fill=r_hi)
    d.line((0, 22, w - 1, 22), fill=r_deep)
    for hx in (35, w // 2, w - 37):
        d.rectangle((hx - 5, 22, hx + 5, 40), fill=r_sh)
        d.rectangle((hx - 10, 35, hx + 10, 42), fill=r_deep)

    # The coat, hanging from the middle hook: shoulders, body, two sleeves.
    cx, top = w // 2, 37
    d.polygon([(cx - 15, top), (cx + 15, top), (cx + 64, top + 50), (cx + 55, top + 74),
               (cx + 35, top + 60), (cx + 37, h - 15), (cx - 37, h - 15), (cx - 35, top + 60),
               (cx - 55, top + 74), (cx - 64, top + 50)], fill=coat)
    d.polygon([(cx - 15, top), (cx + 2, top), (cx + 2, h - 15), (cx - 12, h - 15)], fill=c_sh)
    d.line((cx - 64, top + 50, cx - 15, top), fill=c_hi, width=5)
    d.line((cx + 15, top, cx + 64, top + 50), fill=c_deep, width=5)
    for by in (top + 84, top + 124, top + 164):
        d.rectangle((cx - 7, by, cx - 2, by + 5), fill=GOLD)
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

    rows = ((15, 5), (33, 4), (50, 3), (68, 2))
    r = 28
    for row, (inset, count) in enumerate(rows):
        y = h - 20 - row * (r + 8)
        for i in range(count):
            x = inset + i * (r * 2 + 5)
            d.ellipse((x, y - r, x + r * 2, y + r), fill=bark)
            d.ellipse((x + 5, y - r + 5, x + r * 2 - 5, y + r - 5), fill=face)
            # Growth rings, and a split — enough to say "cut log" and no more.
            d.ellipse((x + 12, y - r + 12, x + r * 2 - 12, y + r - 12), outline=f_sh, width=2)
            d.line((x + r, y - r + 8, x + r, y + r - 8), fill=f_sh, width=2)
            d.arc((x, y - r, x + r * 2, y + r), 200, 340, fill=b_hi, width=2)
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

    # Three drawers, stacked, each with a routed shadow line and two pulls.
    drawer_top, drawer_bottom = top + 10, bottom - 10
    gap = 6
    dh = (drawer_bottom - drawer_top - gap * 2) // 3
    for i in range(3):
        dy0 = drawer_top + i * (dh + gap)
        dy1 = dy0 + dh
        d.rectangle((left + 8, dy0, right - 8, dy1), fill=sh)
        d.rectangle((left + 8, dy0, right - 8, dy0 + 3), fill=_mix(sh, hi, 0.4))
        d.rectangle((left + 8, dy1 - 3, right - 8, dy1), fill=deep)
        pull_y = (dy0 + dy1) // 2
        for px in (left + (right - left) * 0.32, left + (right - left) * 0.68):
            d.ellipse((px - 4, pull_y - 4, px + 4, pull_y + 4), fill=GOLD)
            d.ellipse((px - 4, pull_y - 4, px + 1, pull_y + 1), fill=_mix(GOLD, PARCHMENT, 0.5))

    # Short plinth feet.
    for fx in (left + 6, right - 18):
        d.rectangle((fx, bottom, fx + 12, bottom + round(h * 0.06)), fill=deep)
    return img


# A small roaming animal — a hen, pecking around the floor (2l.1 — a farmhouse-appropriate
# companion to the cat by the fireplace, deliberately a different species so the two don't read
# as duplicates of each other). Same two-frame "idle" technique as make_cat_frames: not a gait,
# just enough motion (the head dips to peck) to read as alive rather than a decal.
def make_chicken_frames(count=2, w=76, h=60):
    """A hen. Frame 2 dips the head down as if pecking at the floor; the body stays put, the
    same "swell, not a gait" restraint make_cat_frames uses for the cat's breathing."""
    frames = []
    shadow = contact_shadow(round(w * 0.7), round(h * 0.16), max_alpha=100)
    body_hi, body, body_sh, _ = ramp(DIAMOND_BODY)
    for i in range(count):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.paste(shadow, (round(w * 0.14), h - round(h * 0.18)), shadow)
        d = ImageDraw.Draw(img)
        peck = round(h * 0.12) * i  # frame 2 only: head/neck drop toward the floor

        # Body: one round-backed oval, tail feathers a small triangle at the back.
        bx0, by0, bx1, by1 = round(w * 0.12), round(h * 0.30), round(w * 0.78), h - round(h * 0.16)
        d.ellipse((bx0, by0, bx1, by1), fill=body)
        d.ellipse((bx0, by0, bx1, by0 + round((by1 - by0) * 0.45)), fill=body_hi)
        d.polygon([(bx0 + 4, by0 + round((by1 - by0) * 0.3)), (bx0 - round(w * 0.14), by0 - 2),
                    (bx0 + 4, by0 + round((by1 - by0) * 0.7))], fill=body_sh)

        # Head: a smaller circle out front, dropping toward the ground on the peck frame.
        hr = round(h * 0.22)
        hx, hy = bx1 - round(w * 0.10), by0 + round(h * 0.06) + peck
        d.ellipse((hx - hr, hy - hr, hx + hr, hy + hr), fill=body_hi)
        # Comb and beak.
        d.polygon([(hx - 4, hy - hr), (hx, hy - hr - 6), (hx + 4, hy - hr)], fill=RED)
        d.polygon([(hx + hr - 2, hy - 2), (hx + hr + 7, hy + 2), (hx + hr - 2, hy + 6)], fill=GOLD)

        # Two thin legs.
        for lx in (bx0 + round((bx1 - bx0) * 0.35), bx0 + round((bx1 - bx0) * 0.62)):
            d.line((lx, by1 - 4, lx, by1 + round(h * 0.14)), fill=GOLD, width=3)
        frames.append(img)
    return frames


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
    for expression in ("idle", "happy", "rueful", "blink"):
        opp = make_opponent(expression)
        _assert_sprite_colours(opp, f"opponent {expression}")
        save_asset(opp, os.path.join(OUT_ROOT, f"opponent_{expression}.png"),
                   f"opponent {expression}", chunk=CHUNK_ENV)
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
        ("picture_2", make_framed_picture_small()),
        ("antlers", make_antlers()),
        ("clock", make_wall_clock()),
        ("coat_hooks", make_coat_hooks()),
        ("woodpile", make_woodpile()),
        ("dresser", make_dresser()),
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
