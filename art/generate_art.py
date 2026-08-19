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
        # Trapper hat: peaked crown, a fur brim, and two fur ear-flaps.
        (_poly([
            (OT_CX - 24, OT_HEAD_CY - 12), (OT_CX - 24, OT_HEAD_CY - 30), (OT_CX, OT_HEAD_CY - 38),
            (OT_CX + 24, OT_HEAD_CY - 30), (OT_CX + 24, OT_HEAD_CY - 12),
        ]), FLANNEL_RED),
        (_ellipse(OT_CX - 30, OT_HEAD_CY - 16, OT_CX - 16, OT_HEAD_CY + 2), HAT_FUR),
        (_ellipse(OT_CX + 16, OT_HEAD_CY - 16, OT_CX + 30, OT_HEAD_CY + 2), HAT_FUR),
        (_poly([
            (OT_CX - 25, OT_HEAD_CY - 14), (OT_CX + 25, OT_HEAD_CY - 14),
            (OT_CX + 25, OT_HEAD_CY - 8), (OT_CX - 25, OT_HEAD_CY - 8),
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
    size = 64
    img = Image.new("RGBA", (size, size), WOOD_MED)
    draw = ImageDraw.Draw(img)

    for seam_x in (21, 43):
        draw.line((seam_x, 0, seam_x, size), fill=WOOD_DARK)
        draw.line((seam_x + 1, 0, seam_x + 1, size), fill=WOOD_LIGHT)

    for row in range(0, size, 4):
        x = 0
        seed = row * 7
        while x < size:
            dash_len = 3 + (seed % 5)
            gap = 2 + ((seed // 5) % 3)
            color = WOOD_LIGHT if (seed // 3) % 2 == 0 else WOOD_DARK
            y = row + ((seed % 3) - 1)
            draw.line((x, y, min(x + dash_len, size - 1), y), fill=color)
            x += dash_len + gap
            seed += 11
    return img


def make_wall_texture() -> Image.Image:
    """Log-cabin wall — vertical rounded logs, distinct from the table felt's horizontal plank
    grain, so the room reads as a different surface behind the table rather than more table."""
    size = 96
    img = Image.new("RGBA", (size, size), WOOD_DARK)
    draw = ImageDraw.Draw(img)

    log_w = 16
    for lx in range(0, size + log_w, log_w):
        draw.ellipse((lx - log_w / 2, -8, lx + log_w / 2, size + 8), outline=WOOD_LIGHT, width=2)
        draw.line((lx, -8, lx, size + 8), fill=WOOD_MED, width=1)

    for row in range(6, size, 17):
        seed = row * 5
        for lx in range(0, size, log_w):
            notch_x = lx + log_w // 2 + (seed % 5) - 2
            draw.line((notch_x - 3, row, notch_x + 3, row), fill=WOOD_DARK)
            seed += 13
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

    portraits_dir = os.path.join(OUT_ROOT, "portraits")
    os.makedirs(portraits_dir, exist_ok=True)
    for expression in ("idle", "happy", "rueful"):
        make_old_timer_portrait(expression).save(
            os.path.join(portraits_dir, f"old_timer_{expression}.png")
        )

    score_dir = os.path.join(OUT_ROOT, "scoreboard")
    os.makedirs(score_dir, exist_ok=True)
    for suit in SUITS:
        for rank in ("4", "6"):
            make_scoreboard_card(rank, suit).save(os.path.join(score_dir, f"{suit}_{rank}.png"))

    print(
        f"Generated {len(SUITS) * len(RANKS)} card faces + card back + table felt "
        f"+ 3 Old-Timer portraits + {len(SUITS) * 2} scoreboard cards -> {OUT_ROOT}"
    )


if __name__ == "__main__":
    main()
