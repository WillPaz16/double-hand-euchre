#!/usr/bin/env python3
"""Deterministically generates every pixel-art asset for the euchre UI from the spec in
ASSETS.md. No AI image generation, no hand-placed pixels to lose track of — just math and
logic, so re-running this script always produces the same output. See ASSETS.md before
editing: change the spec/constants below, not the PNGs in public/art/.
"""
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
WOOD_DARK = (42, 26, 16, 255)
WOOD_MED = (74, 46, 30, 255)
WOOD_LIGHT = (91, 58, 41, 255)
SKIN = (238, 194, 150, 255)
BLUSH = (223, 138, 118, 255)
BEARD_GRAY = (196, 190, 178, 255)
HAIR_AUBURN = (140, 74, 38, 255)
HAIR_BROWN = (104, 68, 40, 255)
CAP_GREEN = (74, 118, 74, 255)  # the Jack's cap — deliberately not suit-colored, so it reads
# as its own garment against all four suit-colored tunics.
BOOT_DARK = (58, 42, 32, 255)
CLOTH_BLUE = (82, 96, 122, 255)   # sleeves — a cool contrast so the body isn't one flat slab,
# and it works against both the red and the soot-brown garments.
STEEL = (172, 178, 188, 255)
ROSE_RED = (198, 72, 66, 255)
LEAF_GREEN = (86, 128, 76, 255)
# --- Environment palette (Phase 2d) ---------------------------------------------------- #
# WOOD_DARK/MED/LIGHT above are intentionally NOT reused or modified here: make_card_back()
# depends on them, and the card art is frozen. These are separate bases, each fed through
# ramp() at use site, plus the cool/warm accents the night-cabin mood needs.
TABLE_WOOD = (88, 55, 34, 255)
WALL_WOOD = (34, 23, 18, 255)   # much darker than the table: value separation is what
# stops the backdrop and the table surface reading as one continuous slab of wood.
CHINKING = (122, 108, 90, 255)      # pale mortar packed between the logs
FLOOR_WOOD = (74, 48, 30, 255)
NIGHT_BLUE = (38, 48, 74, 255)      # the cool reference that makes firelight read warm
NIGHT_BLUE_DEEP = (24, 30, 50, 255)
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
STONE_LIGHT = (134, 118, 102, 255)
STONE_MED = (99, 85, 72, 255)
STONE_DARK = (64, 54, 46, 255)
RUG_RED = (128, 52, 46, 255)
RUG_CREAM = (198, 172, 132, 255)

PIP_FILL_BLACK = (72, 54, 42, 255)  # a "soot brown" — dark like ink, but visibly distinct from
# the INK outline. Reusing INK as both fill and outline made clubs/spades disappear into their
# own outline entirely; text (which is never outlined) can stay true black.

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


def ramp(color, warm=True):
    """Four tones — (highlight, base, shadow, deep) — with a temperature split, not a plain
    multiply. Under warm light, highlights bend amber and shadows bend blue; `warm=False`
    flips it for anything lit by the window instead of the fire.

    The temperature split is the single highest-impact idea of this phase. A pure multiply
    keeps every tone on one hue line, which is what made the old three-brown environment read
    muddy: with nothing cool in frame, warm firelight has nothing to be warm *against*. The
    `warm` flag matters for the same reason in reverse — moonlit frost given firelit
    highlights stops reading as cold, and the window is supposed to be the cool reference the
    whole room is judged against.
    """
    bias = WARM_BIAS if warm else COOL_BIAS
    inverse = tuple(-v for v in bias)
    return (
        _shift(color, 0.34, bias),      # highlight
        color,                          # base
        _shift(color, -0.30, inverse),  # shadow
        _shift(color, -0.54, inverse),  # deep
    )


def make_sprite_sheet(frames):
    """Paste equal-sized frames into one horizontal strip for CSS steps() animation.
    See ASSETS.md: the CSS animates transform (compositor-only), never background-position
    (which repaints every frame)."""
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0), frame)
    return sheet


def light_from(sprite, strength=0.16, from_left=True):
    """Relight a finished sprite directionally, as a post-process.

    **The measurement that prompted this.** Comparing the mean luminance of each scene
    sprite's left half against its right half gave deltas under 1 unit for every single one:
    the fireplace, the cat, the shelf, the seated figure. Every object was shaded purely
    top-down, so nothing in the room had a light *direction* — and a room whose objects agree
    on where the light is not coming from reads as stickers on a backdrop no matter how good
    the gradient painted over them is.

    The room's light source is the hearth, in the left margin. So scene sprites get their
    hearth-facing side lifted and their far side dropped, along a smooth horizontal ramp.

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
    which pure black/INK does not."""
    return RED if suit in RED_SUITS else PIP_FILL_BLACK


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


def make_number_card(rank: str, suit: str) -> Image.Image:
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw_card_frame(ImageDraw.Draw(card))
    size = 48
    paste(card, pip_sprite(suit, size, body_color(suit), outline_px=3), CX - size / 2, 70 - size / 2)
    paste_corners(card, rank, suit)
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
    return card


# --- Old-Timer opponent portrait ---------------------------------------------------------- #
# A deliberately different character from the face-card royalty: where the King is regal
# (crown, formal robe), the Old-Timer is a cabin regular — trapper hat with fur flaps, a red
# flannel shirt and suspenders, a big gray mustache. Bust only (head + shoulders), since it
# sits beside a seat label rather than filling a card, so it gets its own canvas size and none
# of the corner-index layout constraints face cards have.

FLANNEL_RED = (140, 46, 40, 255)
HAT_FUR = (222, 210, 190, 255)

PORTRAIT_W, PORTRAIT_H = 110, 130
OT_CX = PORTRAIT_W // 2
OT_HEAD_CY = 58
OT_HEAD_RX, OT_HEAD_RY = 26, 27


def _old_timer_parts():
    return [
        (_poly([
            (OT_CX - 30, 92), (OT_CX + 30, 92), (OT_CX + 40, PORTRAIT_H), (OT_CX - 40, PORTRAIT_H),
        ]), FLANNEL_RED),
        (_poly([(OT_CX - 18, 92), (OT_CX - 12, 92), (OT_CX - 22, PORTRAIT_H), (OT_CX - 28, PORTRAIT_H)]), BOOT_DARK),
        (_poly([(OT_CX + 12, 92), (OT_CX + 18, 92), (OT_CX + 28, PORTRAIT_H), (OT_CX + 22, PORTRAIT_H)]), BOOT_DARK),
        (_ellipse(OT_CX - OT_HEAD_RX, OT_HEAD_CY - OT_HEAD_RY, OT_CX + OT_HEAD_RX, OT_HEAD_CY + OT_HEAD_RY), SKIN),
        # Big mustache — drawn before the hat so the hat's brim can sit in front of the hairline.
        (_poly([
            (OT_CX - 20, OT_HEAD_CY + 8), (OT_CX - 4, OT_HEAD_CY + 4), (OT_CX, OT_HEAD_CY + 7),
            (OT_CX + 4, OT_HEAD_CY + 4), (OT_CX + 20, OT_HEAD_CY + 8),
            (OT_CX + 16, OT_HEAD_CY + 14), (OT_CX, OT_HEAD_CY + 10), (OT_CX - 16, OT_HEAD_CY + 14),
        ]), BEARD_GRAY),
        # Trapper hat: peaked crown, a fur brim, and two fur ear-flaps. The crown+brim are
        # raised well clear of the eyebrow line (drawn at eye_y-7 in draw_old_timer_face) — an
        # earlier version had the brim sitting almost exactly where the eyebrows are drawn, so
        # every expression read as one gray "ski-goggle" stripe instead of showing brows at
        # all. Ear flaps stay low and to the sides (they hang past the ears, not across the
        # face) so they're not part of that overlap and don't need to move.
        (_poly([
            (OT_CX - 24, OT_HEAD_CY - 22), (OT_CX - 24, OT_HEAD_CY - 40), (OT_CX, OT_HEAD_CY - 48),
            (OT_CX + 24, OT_HEAD_CY - 40), (OT_CX + 24, OT_HEAD_CY - 22),
        ]), FLANNEL_RED),
        (_ellipse(OT_CX - 30, OT_HEAD_CY - 20, OT_CX - 16, OT_HEAD_CY - 2), HAT_FUR),
        (_ellipse(OT_CX + 16, OT_HEAD_CY - 20, OT_CX + 30, OT_HEAD_CY - 2), HAT_FUR),
        (_poly([
            (OT_CX - 25, OT_HEAD_CY - 24), (OT_CX + 25, OT_HEAD_CY - 24),
            (OT_CX + 25, OT_HEAD_CY - 18), (OT_CX - 25, OT_HEAD_CY - 18),
        ]), HAT_FUR),
    ]


def draw_old_timer_face(card: Image.Image, expression: str) -> None:
    """`expression`: "idle" (neutral), "happy" (won a trick/euchre), "rueful" (lost one)."""
    d = ImageDraw.Draw(card)
    eye_y = OT_HEAD_CY - 3
    for side in (-1, 1):
        ex = OT_CX + side * 10
        if expression == "happy":
            d.arc((ex - 4, eye_y - 3, ex + 4, eye_y + 5), start=200, end=340, fill=INK, width=2)
        else:
            d.ellipse((ex - 3, eye_y - 4, ex + 3, eye_y + 4), fill=INK)
            d.rectangle((ex - 2, eye_y - 3, ex - 1, eye_y - 2), fill=(255, 255, 255, 255))

    by = eye_y - 10
    for side in (-1, 1):
        x_out, x_in = OT_CX + side * 17, OT_CX + side * 5
        if expression == "rueful":
            d.line((x_out, by - 3, x_in, by + 2), fill=BEARD_GRAY, width=3)
        elif expression == "happy":
            d.line((x_out, by + 1, x_in, by - 2), fill=BEARD_GRAY, width=3)
        else:
            d.line((x_out, by, x_in, by), fill=BEARD_GRAY, width=3)

    my = OT_HEAD_CY + 16
    if expression == "happy":
        d.arc((OT_CX - 8, my - 4, OT_CX + 8, my + 6), start=15, end=165, fill=INK, width=2)
    elif expression == "rueful":
        d.arc((OT_CX - 6, my, OT_CX + 6, my + 8), start=200, end=340, fill=INK, width=2)
    # idle: no explicit mouth line — the mustache alone reads as neutral.


def make_old_timer_portrait(expression: str) -> Image.Image:
    card = Image.new("RGBA", (PORTRAIT_W, PORTRAIT_H), (0, 0, 0, 0))
    paste(card, composite_sprite(PORTRAIT_W, PORTRAIT_H, _old_timer_parts()), 0, 0)
    draw_old_timer_face(card, expression)
    return card


# --- Scoreboard cards ---------------------------------------------------------------------- #
# Authentic euchre scoring: a 4 and a 6 of a chosen suit, laid out with a traditional
# multi-pip grid (not the single big center pip the playing deck uses) so the two can overlap
# and read as "a partially covered card" the way they do at a real table. The UI slides the 6
# out from behind the 4 as the score rises; a numeral sits alongside since the slide is a
# decorative nod to the ritual, not a pixel-exact pip-counting simulation.

SCORE_CARD_W, SCORE_CARD_H = 60, 84


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
    pip_size = 12
    positions = (
        [(0.32, 0.32), (0.68, 0.32), (0.32, 0.68), (0.68, 0.68)]
        if rank == "4"
        else [
            (0.32, 0.24), (0.68, 0.24), (0.32, 0.5), (0.68, 0.5), (0.32, 0.76), (0.68, 0.76),
        ]
    )
    for fx, fy in positions:
        sprite = pip_sprite(suit, pip_size, body, outline_px=1, shade_depth=1)
        paste(card, sprite, w * fx - pip_size / 2, h * fy - pip_size / 2)

    text = text_color(suit)
    for x, y in ((3, 3), (w - 13, h - 17)):
        gdraw = ImageDraw.Draw(card)
        draw_glyph(gdraw, x, y, GLYPHS[rank], text, scale=1)

    return card


def make_card_back() -> Image.Image:
    img = Image.new("RGBA", (CARD_W, CARD_H), WOOD_DARK)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=(0, 0, 0, 255), width=2)

    step = 14
    for y in range(-step, CARD_H + step, step):
        for x in range(-step, CARD_W + step, step):
            draw.polygon(
                [
                    (x + step // 2, y),
                    (x + step, y + step // 2),
                    (x + step // 2, y + step),
                    (x, y + step // 2),
                ],
                outline=WOOD_LIGHT,
            )
            draw.point((x + step // 2, y + step // 2), fill=WOOD_MED)

    draw.rectangle((7, 7, CARD_W - 8, CARD_H - 8), outline=GOLD, width=2)
    return img


def make_table_felt() -> Image.Image:
    """Table surface — horizontal planks, lit from above. **The calmest surface in the room.**

    Three rules, all learned by looking at the tile repeated to full size rather than on its
    own:

      1. **No point features.** An earlier version put knots here and at 14x14 repeats they
         read as a perfect polka-dot grid, instantly betraying the tiling. Distinctive one-off
         marks belong in the scene layer as placed decals, never in a tile.

      2. **This tile sits directly under the cards.** The design spec's whole environment
         principle is "rich periphery, calm centre", and the previous version violated it more
         than anything else in the room: dense bright grain dashes at high contrast across the
         entire play area — the loudest texture on screen, in the one place that must be
         quietest. Grain is now pulled almost to base and the planks carry the interest.

      3. **Plank tone stays close.** High plank-to-plank contrast reads as stripes rather than
         as one wooden surface. The tonal range is better spent on the plank crown, which
         gives the surface volume, than on shouting where one plank ends.
    """
    size = 128
    hi_f, base, sh_f, deep_f = ramp(TABLE_WOOD)
    hi = _mix(base, hi_f, 0.5)
    sh = _mix(base, sh_f, 0.55)
    deep = _mix(base, deep_f, 0.5)

    img = Image.new("RGBA", (size, size), base)
    draw = ImageDraw.Draw(img)

    plank_h = 32
    plank_tint = (0.00, 0.05, -0.04, 0.02)

    for i, py in enumerate(range(0, size, plank_h)):
        tint = plank_tint[i % len(plank_tint)]
        p_base = _mix(base, hi if tint >= 0 else sh, abs(tint))
        body = plank_h - 2
        for dy in range(body):
            frac = dy / (body - 1)
            tone = _mix(p_base, hi, 0.14) if 0.2 < frac < 0.6 else (
                _mix(p_base, sh, 0.08) if frac < 0.86 else _mix(p_base, sh, 0.26))
            draw.line((0, py + dy, size, py + dy), fill=tone)

        # Grain along the plank. Fixed arithmetic, never `random`, so the tile stays
        # byte-reproducible — and low enough in contrast to read as figure, not as scratches.
        seed = i * 19 + 5
        for gy in range(3, body - 3, 6):
            x = (seed * 7) % 15
            while x < size:
                dash = 12 + (seed % 18)
                draw.line((x, py + gy, min(x + dash, size), py + gy),
                          fill=_mix(p_base, sh if (seed // 4) % 2 else hi, 0.08))
                x += dash + 9 + (seed % 7)
                seed += 11

        draw.line((0, py + body, size, py + body), fill=deep)
        draw.line((0, py + body + 1, size, py + body + 1), fill=_mix(p_base, hi, 0.18))
    return img


def make_wall_texture() -> Image.Image:
    """Log-cabin wall — stacked horizontal logs, each shaded as a cylinder.

    **Three attempts, and the useful record is why the first two failed.**

    v1 argued vertical->horizontal logs would fix striping because horizontal stacking is
    "self-breaking". Wrong: nothing interrupts a horizontal run either.

    v2 added butt joints and broke the mortar into segments so no line ran the full width.
    Tiled out to 1440px it read as **brickwork** — segmented mortar plus visible vertical
    joints is, precisely, a brick bond. It fixed the striping by replacing the material.

    v3 (this one) starts from what the thing IS. A log wall *is* horizontal bands; bands were
    never the defect. It read as venetian blinds because the bands were flat fills separated
    by thin bright rules — so the eye saw the rules, which are the tile's period. Give each
    log a smooth cylindrical falloff and the band becomes a lit surface with volume, and the
    chinking becomes the dark recess between two round things instead of a drawn line.

    So: no joints, no bright mortar, no segmentation. Three logs of unequal height, each with
    a continuous top-lit gradient, separated by a dark gap. What kills the tiling signature is
    the absence of any hard uniform edge, not the addition of more marks.

    Two constraints that still hold from earlier passes:
      - **No point features** (knots, nails). At 11x repeats they become a polka-dot grid.
      - **Stay compressed toward base** via _mix(). This is a backdrop; it must recede behind
        the table rather than compete with the cards.
    """
    size = 128
    hi_f, base, sh_f, deep_f = ramp(WALL_WOOD)
    hi = _mix(base, hi_f, 0.55)
    sh = _mix(base, sh_f, 0.6)
    deep = _mix(base, deep_f, 0.75)

    img = Image.new("RGBA", (size, size), base)
    draw = ImageDraw.Draw(img)

    # Unequal heights summing to `size`, so the wall has no single repeat frequency. The gap
    # between logs is part of each course's height.
    course_h = (40, 46, 42)
    gap = 3
    course_tint = (0.00, 0.08, -0.06)

    ly = 0
    for course, log_h in enumerate(course_h):
        body_h = log_h - gap
        tint = course_tint[course]
        c_base = _mix(base, hi if tint >= 0 else sh, abs(tint))

        for dy in range(body_h):
            frac = dy / (body_h - 1)
            # Cylinder: lit shoulder near the top, falling smoothly to a dark underside. The
            # light sits at 0.3 rather than 0.0 so the very top edge reads as curving away,
            # which is what stops the log looking like a flat strip with a highlight on it.
            if frac < 0.30:
                t = frac / 0.30
                tone = _mix(_mix(c_base, hi, 0.20), _mix(c_base, hi, 0.52), t)
            else:
                t = (frac - 0.30) / 0.70
                tone = _mix(_mix(c_base, hi, 0.52), _mix(c_base, sh, 0.95), t ** 0.85)
            draw.line((0, ly + dy, size, ly + dy), fill=tone)

        # Grain: long dashes running along the log, tinted with the local tone so they never
        # cut across the cylinder shading. Fixed arithmetic, never `random`.
        seed = course * 17 + 3
        for gy in range(4, body_h - 4, 6):
            x = (seed * 5) % 13
            while x < size:
                run = 9 + (seed % 14)
                frac = gy / (body_h - 1)
                streak = _mix(c_base, sh if (seed // 3) % 2 else hi, 0.10 + 0.12 * frac)
                draw.line((x, ly + gy, min(x + run, size), ly + gy), fill=streak)
                x += run + 7 + (seed % 6)
                seed += 7

        # Chinking: the shadowed recess between two round logs. Dark, not pale — as a bright
        # line this was the single loudest element in the tile and did most of the striping.
        for g in range(gap):
            draw.line((0, ly + body_h + g, size, ly + body_h + g),
                      fill=deep if g < gap - 1 else _mix(deep, hi, 0.18))
        ly += log_h
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


def make_fire_frames(count=4, w=66, h=58):
    """Animation frames for the hearth fire. Deterministic: each frame is a pure function of
    its index, no randomness, so regeneration is byte-identical.

    **Height and sway are driven by sin and cos respectively, not both by sin.** With both on
    `sin(phase)` and four frames, phases 0 and pi both give sin = 0, so frames 0 and 2 came out
    with identical height *and* sway — 4 frames but only 3 distinct outer silhouettes, and the
    loop read as a shape pumping between two states rather than as fire. Using sin for one
    dimension and cos for the other makes the pair trace a circle, so every sample is distinct.
    Sampling a single sinusoid at multiples of pi is the general trap here.
    """
    frames = []
    for i in range(count):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        phase = 2 * math.pi * i / count
        sin_p, cos_p = math.sin(phase), math.cos(phase)
        cx, base = w / 2, h - 7

        for lx, ly, lw in ((10, 4, 24), (30, 6, 26), (20, 0, 22)):
            d.rectangle((lx, base + ly - 4, lx + lw, base + ly), fill=darken(WOOD_MED, 0.7))
            d.rectangle((lx, base + ly - 4, lx + lw, base + ly - 3), fill=EMBER)

        _flame(d, cx, base, 36, 32 + 6 * sin_p, 3.5 * cos_p, FIRE_DEEP, phase)
        _flame(d, cx, base, 25, 24 + 5 * cos_p, 2.5 * sin_p, FIRE_MID, phase + 1.1)
        _flame(d, cx, base, 13, 15 + 4 * sin_p, 1.5 * cos_p, FIRE_CORE, phase + 2.2)

        for k, (ex, ey) in enumerate(((16, 22), (42, 28), (30, 16))):
            off = (i * 4 + k * 3) % 14
            d.point((ex + (k % 2), base - ey - off), fill=FIRE_CORE if off < 7 else FIRE_MID)
        frames.append(img)
    return frames


def make_fireplace(w=140, h=186):
    """Stone hearth surround with a firebox opening and a timber mantel.

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

    body_top = 22
    d.rectangle((0, body_top, w - 1, h - 1), fill=mortar)

    course_h = 17
    seed = 5
    row = 0
    y = body_top
    while y < h:
        x = -((row % 3) * 11)
        while x < w:
            sw = 19 + (seed % 15)
            tone = (base, hi, sh, base)[(seed // 3) % 4]
            # Clamp AND check: a course landing near the bottom edge can clamp y1 below y0,
            # which PIL rejects outright ("x1 must be greater than or equal to x0").
            x0, y0 = x + 1, y + 1
            x1, y1 = min(x + sw - 2, w - 1), min(y + course_h - 3, h - 1)
            if x1 >= x0 and y1 >= y0:
                # Firelight falloff: the hearth emits light into the room, so its own stones
                # must be lit by it too. Without this the object throwing the glow is itself
                # uniformly lit, which quietly breaks the illusion.
                mid_x, mid_y = (x0 + x1) / 2, (y0 + y1) / 2
                dist = math.hypot(mid_x - w / 2, mid_y - 132) / 110.0
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
    ox0, ox1 = 36, w - 36
    oy0, oy1 = 98, h - 10
    d.rectangle((ox0, oy0, ox1, oy1), fill=(22, 15, 14, 255))
    for i, band in enumerate(range(oy1 - 18, oy1, 4)):
        d.rectangle((ox0 + 2, band, ox1 - 2, band + 3),
                    fill=_mix((22, 15, 14, 255), EMBER, 0.18 + i * 0.14))
    d.rectangle((ox0, oy0, ox1, oy1), outline=_mix(mortar, deep, 0.6), width=3)
    d.line((ox0 + 3, oy0 + 3, ox1 - 3, oy0 + 3), fill=_mix(deep, FIRE_DEEP, 0.45))

    # Timber mantel, overhanging the stone on both sides.
    m_hi, m_base, m_sh, m_deep = ramp(TABLE_WOOD)
    d.rectangle((0, body_top - 20, w - 1, body_top + 1), fill=m_base)
    d.rectangle((0, body_top - 20, w - 1, body_top - 16), fill=m_hi)
    d.line((0, body_top - 4, w - 1, body_top - 4), fill=m_sh)
    d.line((0, body_top + 1, w - 1, body_top + 1), fill=m_deep)
    return img


WINDOW_W, WINDOW_H = 120, 146


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

    mx, my, mr = int(w * 0.68), int(h * 0.28), 11
    for k in range(4, 0, -1):
        d.ellipse((mx - mr - k * 3, my - mr - k * 3, mx + mr + k * 3, my + mr + k * 3),
                  fill=_mix(g_base, FROST, 0.06 * (5 - k)))
    d.ellipse((mx - mr, my - mr, mx + mr, my + mr), fill=_mix(FROST, (255, 255, 255, 255), 0.5))
    d.ellipse((mx - mr + 4, my - mr + 2, mx + mr - 2, my + mr - 4),
              fill=_mix(FROST, (255, 255, 255, 255), 0.75))
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
        for r in range(26, 6, -5):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=_mix(g_base, FROST, 0.10))

    bar = 5
    d.rectangle((w // 2 - bar // 2, 0, w // 2 + bar // 2, h - 1), fill=f_base)
    d.rectangle((0, h // 2 - bar // 2, w - 1, h // 2 + bar // 2), fill=f_base)
    d.line((w // 2 - bar // 2, 0, w // 2 - bar // 2, h - 1), fill=f_hi)
    d.line((0, h // 2 - bar // 2, w - 1, h // 2 - bar // 2), fill=f_hi)

    for i, tone in enumerate((f_hi, f_base, f_sh)):
        d.rectangle((i, i, w - 1 - i, h - 1 - i), outline=tone, width=1)
    d.rectangle((3, 3, w - 4, h - 4), outline=f_deep, width=2)
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
    hi_f, base, sh_f, deep_f = ramp(FLOOR_WOOD)
    hi = _mix(base, hi_f, 0.45)
    sh = _mix(base, sh_f, 0.5)
    deep = _mix(base, deep_f, 0.55)

    img = Image.new("RGBA", (size, size), base)
    d = ImageDraw.Draw(img)

    board_h = 32
    # One joint per board, widely spaced and at different offsets, so nothing lines up.
    joints = (103, 37, 128, 61, 14)
    board_tint = (0.00, 0.07, -0.05, 0.03, -0.02)

    for row, by in enumerate(range(0, size, board_h)):
        b_base = _mix(base, hi if board_tint[row] >= 0 else sh, abs(board_tint[row]))
        body = board_h - 2
        for dy in range(body):
            frac = dy / (body - 1)
            # Gentle crown: boards cup slightly, catching light along the middle.
            tone = _mix(b_base, hi, 0.16) if 0.25 < frac < 0.62 else (
                _mix(b_base, sh, 0.10) if frac < 0.85 else _mix(b_base, sh, 0.30))
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

SEAT_W, SEAT_H = 140, 196
SEAT_CX = SEAT_W // 2
SEAT_HEAD_CY = 66
SEAT_HEAD_RX, SEAT_HEAD_RY = 26, 27


def _mini_card_back(w=20, h=30):
    """A small card back for the seated figure's hand. Uses the real card-back palette
    (WOOD_DARK ground, GOLD inner border, lattice) rather than an arbitrary brown, so a hand
    of them reads as *cards* and not as some other brown object."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w - 1, h - 1), fill=WOOD_DARK, outline=INK)
    d.rectangle((2, 2, w - 3, h - 3), outline=GOLD)
    for y in range(5, h - 4, 5):
        for x in range(5, w - 4, 5):
            d.point((x, y), fill=WOOD_LIGHT)
    return img


def make_seated_old_timer():
    """The opponent, seated in the room — same character as the scoreboard portrait (trapper
    hat with fur flaps, red flannel, big gray mustache), rebuilt at full body holding a fan
    of cards.

    Head geometry deliberately matches `_old_timer_parts()` exactly (same radius, same hat
    construction) so the seated figure and the portrait read as one person rather than two
    similar characters. Only the framing differs.

    Three bugs review caught in the first version, all worth remembering:

    1. **The "fan" was never rotated.** The loop variable was named `ang`, which encoded the
       *intent*, but it was only ever used as an x-offset — no rotation was applied anywhere.
       Five 18px cards at 12px spacing merged into one contiguous band, filled brown with a
       gold inner rect: unmistakably a belt with a brass buckle. A variable named for what you
       meant, in code that does something else, is nearly invisible on re-reading — the author
       sees the intent, a fresh reader sees the belt. Each card is now rotated on its own
       layer before compositing.
    2. **No chair and no lap, so he read as a standing bust.** The chair was
       `darken(WOOD_MED, 0.55)` — near-black against a dark wall, invisible at every viewport
       — and the torso simply ran off the bottom of the canvas with no thigh break. The chair
       now uses lit ramp tones, and the torso stops at a lap.
    3. **Invisible arms.** FLANNEL_RED arms drawn over a FLANNEL_RED torso in an overlapping
       x-range have no silhouette separation at all. They now use the shade tone.
    """
    c_hi, c_base, c_sh, c_deep = ramp(WOOD_MED)
    arm = darken(FLANNEL_RED, 0.74)
    trouser = darken(BOOT_DARK, 1.25)
    lap_y = 158

    parts = [
        # Chair: lit enough to actually be visible against the dark wall behind it.
        (_poly([(SEAT_CX - 46, 50), (SEAT_CX + 46, 50), (SEAT_CX + 46, 72), (SEAT_CX - 46, 72)]), c_base),
        (_poly([(SEAT_CX - 46, 50), (SEAT_CX - 37, 50), (SEAT_CX - 37, SEAT_H), (SEAT_CX - 46, SEAT_H)]), c_sh),
        (_poly([(SEAT_CX + 37, 50), (SEAT_CX + 46, 50), (SEAT_CX + 46, SEAT_H), (SEAT_CX + 37, SEAT_H)]), c_sh),
        # Lap and thighs — the break that makes "seated" read instead of "standing bust".
        (_poly([(SEAT_CX - 40, lap_y), (SEAT_CX + 40, lap_y), (SEAT_CX + 44, SEAT_H), (SEAT_CX - 44, SEAT_H)]), trouser),
        # Torso, stopping at the lap.
        (_poly([(SEAT_CX - 32, 96), (SEAT_CX + 32, 96), (SEAT_CX + 38, lap_y), (SEAT_CX - 38, lap_y)]), FLANNEL_RED),
        (_poly([(SEAT_CX - 19, 96), (SEAT_CX - 11, 96), (SEAT_CX - 14, lap_y), (SEAT_CX - 22, lap_y)]), BOOT_DARK),
        (_poly([(SEAT_CX + 11, 96), (SEAT_CX + 19, 96), (SEAT_CX + 22, lap_y), (SEAT_CX + 14, lap_y)]), BOOT_DARK),
        # Arms in the shade tone so they separate from the torso.
        (_poly([(SEAT_CX - 44, 108), (SEAT_CX - 30, 104), (SEAT_CX - 24, 150), (SEAT_CX - 42, 154)]), arm),
        (_poly([(SEAT_CX + 30, 104), (SEAT_CX + 44, 108), (SEAT_CX + 42, 154), (SEAT_CX + 24, 150)]), arm),
        (_ellipse(SEAT_CX - 44, 140, SEAT_CX - 26, 158), SKIN),
        (_ellipse(SEAT_CX + 26, 140, SEAT_CX + 44, 158), SKIN),
        # Head.
        (_ellipse(SEAT_CX - SEAT_HEAD_RX, SEAT_HEAD_CY - SEAT_HEAD_RY,
                  SEAT_CX + SEAT_HEAD_RX, SEAT_HEAD_CY + SEAT_HEAD_RY), SKIN),
        (_poly([
            (SEAT_CX - 20, SEAT_HEAD_CY + 8), (SEAT_CX - 4, SEAT_HEAD_CY + 4),
            (SEAT_CX, SEAT_HEAD_CY + 7), (SEAT_CX + 4, SEAT_HEAD_CY + 4),
            (SEAT_CX + 20, SEAT_HEAD_CY + 8), (SEAT_CX + 16, SEAT_HEAD_CY + 14),
            (SEAT_CX, SEAT_HEAD_CY + 10), (SEAT_CX - 16, SEAT_HEAD_CY + 14),
        ]), BEARD_GRAY),
        # Trapper hat: crown raised clear of the brow (a portrait bug once put the brim across
        # the eyebrow line and every expression read as one gray stripe).
        (_poly([
            (SEAT_CX - 24, SEAT_HEAD_CY - 22), (SEAT_CX - 24, SEAT_HEAD_CY - 40),
            (SEAT_CX, SEAT_HEAD_CY - 48), (SEAT_CX + 24, SEAT_HEAD_CY - 40),
            (SEAT_CX + 24, SEAT_HEAD_CY - 22),
        ]), FLANNEL_RED),
        (_ellipse(SEAT_CX - 30, SEAT_HEAD_CY - 20, SEAT_CX - 16, SEAT_HEAD_CY - 2), HAT_FUR),
        (_ellipse(SEAT_CX + 16, SEAT_HEAD_CY - 20, SEAT_CX + 30, SEAT_HEAD_CY - 2), HAT_FUR),
        (_poly([
            (SEAT_CX - 25, SEAT_HEAD_CY - 24), (SEAT_CX + 25, SEAT_HEAD_CY - 24),
            (SEAT_CX + 25, SEAT_HEAD_CY - 18), (SEAT_CX - 25, SEAT_HEAD_CY - 18),
        ]), HAT_FUR),
    ]
    img = Image.new("RGBA", (SEAT_W, SEAT_H), (0, 0, 0, 0))
    paste(img, composite_sprite(SEAT_W, SEAT_H, parts), 0, 0)

    # The hand, composited after the silhouette so it reads as held in front of him. Each card
    # is rotated on its own layer — NEAREST keeps the edges hard, as pixel art requires.
    for ang, dx in zip((-26, -13, 0, 13, 26), (-34, -18, 0, 18, 34)):
        card = _mini_card_back()
        rot = card.rotate(-ang, expand=True, resample=Image.NEAREST)
        cx = SEAT_CX + dx - rot.width // 2
        cy = int(126 + abs(ang) * 0.42)
        img.paste(rot, (cx, cy), rot)

    d = ImageDraw.Draw(img)
    eye_y = SEAT_HEAD_CY - 3
    for side in (-1, 1):
        ex = SEAT_CX + side * 10
        d.ellipse((ex - 3, eye_y - 4, ex + 3, eye_y + 4), fill=INK)
        d.rectangle((ex - 2, eye_y - 3, ex - 1, eye_y - 2), fill=(255, 255, 255, 255))
        d.line((SEAT_CX + side * 17, eye_y - 10, SEAT_CX + side * 5, eye_y - 10),
               fill=BEARD_GRAY, width=3)
    return img


def make_cat_frames(count=2, w=52, h=34):
    """A cat asleep by the fire, two frames of slow breathing.

    Two frames is enough because the motion is a swell, not a gait — the body rises a pixel.
    Animated slowly that reads as breathing; more frames would add nothing perceptible here.

    Carries a contact shadow. Brown fur on a brown floor with no shadow read as a smudge, and
    `contact_shadow()` had sat unused since 2d.1 built it — this is its first real consumer.
    """
    frames = []
    shadow = contact_shadow(44, 9, max_alpha=118)
    for i in range(count):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.paste(shadow, (5, h - 10), shadow)
        rise = i
        body_top = 14 - rise
        parts = [
            (_ellipse(6, body_top, w - 14, h - 6), HAIR_BROWN),
            (_ellipse(w - 26, body_top - 5, w - 4, h - 12), HAIR_BROWN),
            (_poly([(w - 22, body_top - 4), (w - 17, body_top - 12), (w - 13, body_top - 3)]), HAIR_BROWN),
            (_poly([(w - 11, body_top - 4), (w - 6, body_top - 12), (w - 3, body_top - 3)]), HAIR_BROWN),
            (_ellipse(2, h - 16, 22, h - 8), HAIR_BROWN),
        ]
        paste(img, composite_sprite(w, h, parts), 0, 0)
        d = ImageDraw.Draw(img)
        for ex in (w - 20, w - 11):
            d.line((ex, body_top + 4, ex + 4, body_top + 4), fill=INK)
        frames.append(img)
    return frames


def make_shelf(w=118, h=62):
    """A wall shelf with clutter — jars, books, a lantern. Placed once, never tiled, so unlike
    the wall texture it may carry all the distinctive point detail it likes."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hi, base, sh, deep = ramp(TABLE_WOOD)

    plank_y = h - 12
    d.rectangle((0, plank_y, w - 1, plank_y + 6), fill=base)
    d.line((0, plank_y, w - 1, plank_y), fill=hi)
    d.line((0, plank_y + 6, w - 1, plank_y + 6), fill=deep)
    for bx in (10, w - 16):
        d.polygon([(bx, plank_y + 6), (bx + 6, plank_y + 6), (bx + 3, h - 1)], fill=sh)

    # Books, leaning.
    for i, (bx, bh, col) in enumerate(((8, 26, RUG_RED), (16, 30, LEAF_GREEN), (24, 24, CLOTH_BLUE))):
        d.rectangle((bx, plank_y - bh, bx + 7, plank_y - 1), fill=col)
        d.rectangle((bx, plank_y - bh, bx + 7, plank_y - bh + 2), fill=_mix(col, GOLD, 0.5))

    # Jars.
    for jx, jh, fill in ((44, 20, _mix(LEAF_GREEN, PARCHMENT, 0.4)), (62, 16, _mix(RUG_RED, PARCHMENT, 0.5))):
        d.rectangle((jx, plank_y - jh, jx + 13, plank_y - 1), fill=fill)
        d.rectangle((jx, plank_y - jh, jx + 13, plank_y - jh + 3), fill=sh)
        d.line((jx, plank_y - jh + 5, jx + 13, plank_y - jh + 5), fill=_mix(fill, PARCHMENT, 0.5))

    # Lantern, with a lit pane.
    lx = 86
    d.rectangle((lx, plank_y - 28, lx + 18, plank_y - 1), fill=sh)
    d.rectangle((lx + 3, plank_y - 24, lx + 15, plank_y - 8), fill=_mix(FIRE_MID, PARCHMENT, 0.35))
    d.rectangle((lx + 5, plank_y - 22, lx + 13, plank_y - 10), fill=FIRE_CORE)
    d.rectangle((lx + 6, plank_y - 32, lx + 12, plank_y - 28), fill=deep)
    return img


def main() -> None:
    cards_dir = os.path.join(OUT_ROOT, "cards")
    os.makedirs(cards_dir, exist_ok=True)

    for suit in SUITS:
        for rank in RANKS:
            card = make_face_card(rank, suit) if rank in FACE_RANKS else make_number_card(rank, suit)
            card.save(os.path.join(cards_dir, f"{suit}_{rank}.png"))

    make_card_back().save(os.path.join(OUT_ROOT, "card_back.png"))
    make_table_felt().save(os.path.join(OUT_ROOT, "table_felt.png"))
    make_wall_texture().save(os.path.join(OUT_ROOT, "wall_texture.png"))

    scene_dir = os.path.join(OUT_ROOT, "scene")
    os.makedirs(scene_dir, exist_ok=True)
    make_fireplace().save(os.path.join(scene_dir, "fireplace.png"))
    make_sprite_sheet(make_fire_frames()).save(os.path.join(scene_dir, "fire_sheet.png"))
    make_window_glass().save(os.path.join(scene_dir, "window_glass.png"))
    make_window_frame().save(os.path.join(scene_dir, "window_frame.png"))
    make_snowfall().save(os.path.join(scene_dir, "snow.png"))
    make_floorboards().save(os.path.join(scene_dir, "floor.png"))
    # Everything in the room is lit by the hearth, which sits in the LEFT margin. Applied here
    # rather than inside each generator so the light model is stated once, in one place, and
    # so it demonstrably cannot reach the card art. The fireplace and the window are their own
    # light sources and are deliberately excluded.
    light_from(make_seated_old_timer()).save(os.path.join(scene_dir, "seated_old_timer.png"))
    light_from(make_sprite_sheet(make_cat_frames()), strength=0.13).save(
        os.path.join(scene_dir, "cat_sheet.png"))
    light_from(make_shelf(), strength=0.13).save(os.path.join(scene_dir, "shelf.png"))

    portraits_dir = os.path.join(OUT_ROOT, "portraits")
    os.makedirs(portraits_dir, exist_ok=True)
    for expression in ("idle", "happy", "rueful"):
        make_old_timer_portrait(expression).save(
            os.path.join(portraits_dir, f"old_timer_{expression}.png")
        )

    # Only the suits SCORE_SUIT actually assigns (src/ui/Scoreboard.tsx: A -> hearts,
    # B -> spades) get scoreboard cards — generating all four was dead weight, since each
    # player's suit is currently fixed, not a real choice yet (see that file's comment). If
    # per-player suit choice becomes a real setting, add suits here to match.
    SCOREBOARD_SUITS = ("hearts", "spades")
    score_dir = os.path.join(OUT_ROOT, "scoreboard")
    os.makedirs(score_dir, exist_ok=True)
    for suit in SCOREBOARD_SUITS:
        for rank in ("4", "6"):
            make_scoreboard_card(rank, suit).save(os.path.join(score_dir, f"{suit}_{rank}.png"))

    print(
        f"Generated {len(SUITS) * len(RANKS)} card faces + card back + table felt "
        f"+ 3 Old-Timer portraits + {len(SCOREBOARD_SUITS) * 2} scoreboard cards -> {OUT_ROOT}"
    )


if __name__ == "__main__":
    main()
