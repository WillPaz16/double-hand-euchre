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
GOLD_DARK = (168, 124, 48, 255)
WOOD_DARK = (42, 26, 16, 255)
WOOD_MED = (74, 46, 30, 255)
WOOD_LIGHT = (91, 58, 41, 255)
SKIN = (231, 183, 138, 255)
BLUSH = (220, 132, 112, 255)
BEARD_GRAY = (176, 168, 156, 255)  # the King is old and grizzled — same spirit as the
# single-player opponent — rather than a generic storybook king.
HAIR_AUBURN = (128, 68, 36, 255)
CAP_NAVY = (52, 60, 84, 255)  # the Jack's cap — deliberately not suit-colored, so it reads as
# its own garment against all four suit-colored bodies.
PIP_FILL_BLACK = (72, 54, 42, 255)  # a "soot brown" — dark like ink, but visibly distinct from
# the INK outline. Reusing INK as both fill and outline made clubs/spades disappear into their
# own outline entirely; text (which is never outlined) can stay true black.

SUITS = ["clubs", "diamonds", "hearts", "spades"]
RANKS = ["9", "10", "J", "Q", "K", "A"]
RED_SUITS = {"diamonds", "hearts"}
FACE_RANKS = {"J", "Q", "K"}

# Native card resolution. Chosen so it equals the *previous* on-screen display size (was drawn
# at 40x56 and shown at a 2x CSS scale = 80x112) — so bumping resolution here for smoother
# curves needed zero CSS/React changes: the "normal" size is now a true 1:1 native render
# instead of an upscale, and the "mini" seat-back size is a clean 2x downscale of it.
CARD_W, CARD_H = 80, 112
OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "art")


def text_color(suit: str):
    """For the un-outlined corner rank glyph — wants maximum contrast against parchment."""
    return RED if suit in RED_SUITS else INK


def body_color(suit: str):
    """For anything outlined (pips, the character body) — needs to differ from the INK
    outline itself, which pure black/INK does not."""
    return RED if suit in RED_SUITS else PIP_FILL_BLACK


# --- Outline system --------------------------------------------------------------------- #
# The Balatro-style "sticker" look comes from a solid outline hugging every distinct piece —
# a head, a crown, a suit pip — not from a single outline around the whole card. Each piece is
# rendered as its own small outlined sprite (fill a mask, dilate it, ring = dilated - mask,
# paint outline then fill) and pasted onto the card in the right order/position.


def outlined_sprite(w, h, draw_fn, fill, outline=INK, outline_px=2, pad=4):
    """`draw_fn(mask_draw, ox, oy)` must draw one or more fully-opaque (fill=255) primitives
    onto a grayscale mask, offset by (ox, oy) — multiple primitives merge into one seamless
    silhouette with a single outline around the union. Returns (sprite, pad); paste at
    (target_x - pad, target_y - pad) so the shape's local (0,0) lands at (target_x, target_y).
    """
    cw, ch = round(w + pad * 2), round(h + pad * 2)
    mask = Image.new("L", (cw, ch), 0)
    draw_fn(ImageDraw.Draw(mask), pad, pad)
    dilated = mask.filter(ImageFilter.MaxFilter(outline_px * 2 + 1))
    ring = ImageChops.subtract(dilated, mask)

    sprite = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sprite.paste(Image.new("RGBA", (cw, ch), outline), (0, 0), ring)
    sprite.paste(Image.new("RGBA", (cw, ch), fill), (0, 0), mask)
    return sprite, pad


def paste(card: Image.Image, sprite_and_pad, x, y) -> None:
    sprite, pad = sprite_and_pad
    card.paste(sprite, (round(x - pad), round(y - pad)), sprite)


# --- Tiny bold 5x7 bitmap font, drawn at 2x block scale (10x14 rendered) — only the glyphs a
# euchre deck needs. --- #
GLYPHS = {
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "J": ["...#.", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "A": ["..#..", ".#.#.", "#...#", "#...#", "#####", "#...#", "#...#"],
}
GLYPH_SCALE = 2


def draw_glyph(draw: ImageDraw.ImageDraw, x, y, glyph, color, scale=GLYPH_SCALE) -> None:
    for row_i, row in enumerate(glyph):
        for col_i, ch in enumerate(row):
            if ch == "#":
                px, py = x + col_i * scale, y + row_i * scale
                draw.rectangle((px, py, px + scale - 1, py + scale - 1), fill=color)


# --- Suit pips — a true parametric heart curve (the classic
# x=16sin^3(t), y=13cos(t)-5cos(2t)-2cos(3t)-cos(4t) formula), not hand-approximated circles.
# Spade is the same curve flipped, plus a stem — the real heart/spade relationship. Club is
# three well-separated circles (a wide arrangement radius relative to each circle's own
# radius, so a "waist" shows between lobes instead of merging into a blob) plus a tapered
# stem. One mask function per suit, at any box size — a corner-mini and a center-large pip
# are the same function, so curves stay round at every scale. --- #


def _heart_curve_points(w, h, ox, oy, steps=72, lobes_up=True):
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


def _heart_mask(w, h):
    def draw_fn(d, ox, oy):
        d.polygon(_heart_curve_points(w, h, ox, oy, lobes_up=True), fill=255)

    return draw_fn


def _spade_mask(w, h):
    def draw_fn(d, ox, oy):
        body_h = h * 0.80
        d.polygon(_heart_curve_points(w, body_h, ox, oy, lobes_up=False), fill=255)
        stem_w = max(2.0, w * 0.16)
        cx = ox + w / 2
        notch_y = oy + body_h * 0.86
        d.polygon(
            [
                (cx - stem_w / 2, notch_y),
                (cx + stem_w / 2, notch_y),
                (cx + stem_w * 1.8, oy + h),
                (cx - stem_w * 1.8, oy + h),
            ],
            fill=255,
        )

    return draw_fn


def _diamond_mask(w, h):
    def draw_fn(d, ox, oy):
        cx, cy = ox + w / 2, oy + h / 2
        d.polygon([(cx, oy), (ox + w, cy), (cx, oy + h), (ox, cy)], fill=255)

    return draw_fn


def _club_mask(w, h):
    def draw_fn(d, ox, oy):
        cx0, cy0 = ox + w / 2, oy + h * 0.42
        arrange_r, lobe_r = w * 0.20, w * 0.20
        for angle_deg in (-90, 30, 150):
            rad = math.radians(angle_deg)
            cx, cy = cx0 + arrange_r * math.cos(rad), cy0 + arrange_r * math.sin(rad)
            d.ellipse((cx - lobe_r, cy - lobe_r, cx + lobe_r, cy + lobe_r), fill=255)
        stem_top_w, stem_bot_w = max(2.0, w * 0.14), max(2.0, w * 0.26)
        cx = ox + w / 2
        stem_top_y = cy0 + arrange_r * 0.3
        d.polygon(
            [
                (cx - stem_top_w / 2, stem_top_y),
                (cx + stem_top_w / 2, stem_top_y),
                (cx + stem_bot_w / 2, oy + h),
                (cx - stem_bot_w / 2, oy + h),
            ],
            fill=255,
        )

    return draw_fn


PIP_MASKS = {"hearts": _heart_mask, "diamonds": _diamond_mask, "spades": _spade_mask, "clubs": _club_mask}


def pip_sprite(suit: str, size, fill, outline_px=2):
    return outlined_sprite(size, size, PIP_MASKS[suit](size, size), fill, outline_px=outline_px)


def draw_card_frame(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), fill=PARCHMENT)
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=INK, width=2)
    draw.rectangle((2, 2, CARD_W - 3, CARD_H - 3), outline=PARCHMENT_SHADOW)


def paste_corners(card: Image.Image, rank: str, suit: str, pip_size=13) -> None:
    text, body = text_color(suit), body_color(suit)
    pip_img, pip_pad = pip_sprite(suit, pip_size, body)

    glyph_w = 10 + 2 + 10 if rank == "10" else 10  # '1' + gap + '0' when two digits, at 2x scale
    glyph_h = 14
    gap = 3
    block_w = max(glyph_w, pip_img.width)
    block_h = glyph_h + gap + pip_img.height

    marker = Image.new("RGBA", (block_w, block_h), (0, 0, 0, 0))
    mdraw = ImageDraw.Draw(marker)
    if rank == "10":
        draw_glyph(mdraw, 0, 0, GLYPHS["1"], text)
        draw_glyph(mdraw, 12, 0, GLYPHS["0"], text)
    else:
        draw_glyph(mdraw, 0, 0, GLYPHS[rank], text)
    marker.paste(pip_img, ((block_w - pip_img.width) // 2, glyph_h + gap), pip_img)

    margin = 5
    card.paste(marker, (margin, margin), marker)
    flipped = marker.rotate(180)
    card.paste(flipped, (CARD_W - block_w - margin, CARD_H - block_h - margin), flipped)


def make_number_card(rank: str, suit: str) -> Image.Image:
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw_card_frame(draw)

    sprite = pip_sprite(suit, 40, body_color(suit), outline_px=3)
    paste(card, sprite, CARD_W / 2 - 20, CARD_H / 2 - 20)

    paste_corners(card, rank, suit)
    return card


# --- Face-card portraits ----------------------------------------------------------------- #
# Extreme chibi proportions inspired directly by Gen-3/4 Pokemon overworld trainer sprites: a
# big round head carries almost all of the character, headwear is the main silhouette/identity
# signature (not the face), and the body underneath is a small simple color block. Balatro's
# contribution is the outline on every piece; the face itself (round eyes with a highlight,
# brows, blush) is what keeps it warm rather than purely graphic.

CX = CARD_W // 2
HEAD_CY = 46
HEAD_R = 16


def _ellipse_mask(w, h):
    def draw_fn(d, ox, oy):
        d.ellipse((ox, oy, ox + w, oy + h), fill=255)

    return draw_fn


def draw_body(card: Image.Image, color) -> None:
    """A small simple color-blocked body beneath the (much bigger) head — deliberately
    minimal, Pokemon-sprite style, rather than an elaborate robe."""
    top_y, bottom_y = HEAD_CY + HEAD_R - 5, HEAD_CY + HEAD_R + 20
    half_top, half_bottom = 13, 19
    w, h = half_bottom * 2, bottom_y - top_y

    def draw_fn(d, ox, oy):
        cx = ox + w / 2
        d.polygon(
            [
                (cx - half_top, oy),
                (cx + half_top, oy),
                (cx + half_bottom, oy + h),
                (cx - half_bottom, oy + h),
            ],
            fill=255,
        )

    sprite = outlined_sprite(w, h, draw_fn, color)
    paste(card, sprite, CX - w / 2, top_y)
    draw = ImageDraw.Draw(card)
    draw.line((CX - half_top + 2, top_y + 2, CX + half_top - 2, top_y + 2), fill=GOLD, width=2)


def draw_head(card: Image.Image) -> None:
    sprite = outlined_sprite(HEAD_R * 2, HEAD_R * 2, _ellipse_mask(HEAD_R * 2, HEAD_R * 2), SKIN, outline_px=2)
    paste(card, sprite, CX - HEAD_R, HEAD_CY - HEAD_R)


def draw_face(card: Image.Image, brow_color, brow_angle=0, smile=True) -> None:
    """Round eyes with a sparkle highlight, brows, blush, a mouth. `brow_angle`: -1 tilts the
    left brow up / right down (a sly, asymmetric look), 0 is level, 1 is a stern furrowed V."""
    draw = ImageDraw.Draw(card)
    eye_y = HEAD_CY
    for side in (-1, 1):
        ex = CX + side * 6
        draw.ellipse((ex - 2, eye_y - 3, ex + 2, eye_y + 3), fill=INK)
        draw.point((ex - 1, eye_y - 2), fill=(255, 255, 255, 255))

    brow_y = HEAD_CY - 8
    if brow_angle == 0:
        draw.line((CX - 10, brow_y, CX - 4, brow_y), fill=brow_color, width=2)
        draw.line((CX + 4, brow_y, CX + 10, brow_y), fill=brow_color, width=2)
    elif brow_angle > 0:  # furrowed — inner ends dip down, a stern King look
        draw.line((CX - 10, brow_y - 2, CX - 4, brow_y + 2), fill=brow_color, width=2)
        draw.line((CX + 4, brow_y + 2, CX + 10, brow_y - 2), fill=brow_color, width=2)
    else:  # one raised — a cheeky, asymmetric Jack look
        draw.line((CX - 10, brow_y, CX - 4, brow_y - 4), fill=brow_color, width=2)
        draw.line((CX + 4, brow_y + 2, CX + 10, brow_y + 2), fill=brow_color, width=2)

    for side in (-1, 1):
        bx = CX + side * 10
        draw.ellipse((bx - 2, HEAD_CY + 5, bx + 2, HEAD_CY + 8), fill=BLUSH)

    mouth_y = HEAD_CY + 9
    if smile:
        draw.arc((CX - 6, mouth_y - 5, CX + 6, mouth_y + 4), start=15, end=165, fill=INK, width=2)
    else:
        draw.line((CX - 4, mouth_y, CX + 4, mouth_y), fill=INK, width=2)


def make_face_card(rank: str, suit: str) -> Image.Image:
    """Each rank is a chibi bust, not a letter in a box: the King is old and grizzled (a nod to
    the single-player opponent) with a big crown, furrowed brows and a beard; the Queen has
    flowing hair, a circlet and a level smile; the Jack — a knave, not royalty — has a tilted
    cap, a feather and a cheeky raised brow. Every piece (head, hair, crown, body) is its own
    outlined sprite, composited in the right order."""
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw_card_frame(draw)
    color = body_color(suit)

    if rank == "K":
        draw_body(card, color)
        draw_head(card)
        beard_top = HEAD_CY + 6
        beard_w, beard_h = 24, 20

        def beard_fn(d, ox, oy):
            d.polygon([(ox, oy), (ox + beard_w, oy), (ox + beard_w / 2, oy + beard_h)], fill=255)

        paste(card, outlined_sprite(beard_w, beard_h, beard_fn, BEARD_GRAY), CX - beard_w / 2, beard_top)
        draw_face(card, BEARD_GRAY, brow_angle=1, smile=False)

        crown_w, crown_h = 34, 18
        crown_base = HEAD_CY - HEAD_R - 2

        def crown_fn(d, ox, oy):
            d.polygon(
                [
                    (ox, oy + crown_h),
                    (ox, oy + crown_h - 8),
                    (ox + crown_w * 0.2, oy + crown_h - 3),
                    (ox + crown_w * 0.35, oy + crown_h - 10),
                    (ox + crown_w * 0.5, oy),
                    (ox + crown_w * 0.65, oy + crown_h - 10),
                    (ox + crown_w * 0.8, oy + crown_h - 3),
                    (ox + crown_w, oy + crown_h - 8),
                    (ox + crown_w, oy + crown_h),
                ],
                fill=255,
            )

        paste(card, outlined_sprite(crown_w, crown_h, crown_fn, GOLD), CX - crown_w / 2, crown_base - crown_h)
        d2 = ImageDraw.Draw(card)
        d2.ellipse((CX - 2, crown_base - crown_h - 1, CX + 2, crown_base - crown_h + 3), fill=GOLD_DARK)

    elif rank == "Q":
        hair_w, hair_h = 15, 34
        for side in (-1, 1):
            hx = CX + side * (HEAD_R + 2) - hair_w / 2
            paste(card, outlined_sprite(hair_w, hair_h, _ellipse_mask(hair_w, hair_h), HAIR_AUBURN), hx, HEAD_CY - 10)
        draw_body(card, color)
        draw_head(card)
        draw_face(card, HAIR_AUBURN, brow_angle=0, smile=True)

        band_y = HEAD_CY - HEAD_R + 4
        d2 = ImageDraw.Draw(card)
        d2.line((CX - 11, band_y, CX + 11, band_y), fill=GOLD_DARK, width=3)
        d2.line((CX - 11, band_y - 2, CX + 11, band_y - 2), fill=GOLD, width=2)
        d2.ellipse((CX - 3, band_y - 8, CX + 3, band_y - 2), fill=GOLD)
        d2.ellipse((CX - 2, band_y - 7, CX + 2, band_y - 3), fill=GOLD_DARK)

    else:  # J — no crown, just a cap, a feather, and one raised eyebrow.
        draw_body(card, color)
        draw_head(card)
        draw_face(card, INK_LIGHT, brow_angle=-1, smile=True)

        cap_w, cap_h = 30, 16
        cap_top = HEAD_CY - HEAD_R - 8

        def cap_fn(d, ox, oy):
            d.ellipse((ox, oy, ox + cap_w, oy + cap_h), fill=255)

        paste(card, outlined_sprite(cap_w, cap_h, cap_fn, CAP_NAVY), CX - cap_w * 0.35, cap_top)
        d2 = ImageDraw.Draw(card)
        feather_base = (CX + cap_w * 0.35, cap_top + 2)
        feather_tip = (feather_base[0] + 12, feather_base[1] - 14)
        d2.line((feather_base, feather_tip), fill=GOLD, width=2)
        d2.ellipse((feather_tip[0] - 2, feather_tip[1] - 2, feather_tip[0] + 2, feather_tip[1] + 2), fill=GOLD)

    paste_corners(card, rank, suit)
    return card


def make_card_back() -> Image.Image:
    img = Image.new("RGBA", (CARD_W, CARD_H), WOOD_DARK)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=(0, 0, 0, 255), width=2)

    step = 12
    for y in range(-step, CARD_H + step, step):
        for x in range(-step, CARD_W + step, step):
            diamond = [
                (x + step // 2, y),
                (x + step, y + step // 2),
                (x + step // 2, y + step),
                (x, y + step // 2),
            ]
            draw.polygon(diamond, outline=WOOD_LIGHT)
            draw.point((x + step // 2, y + step // 2), fill=WOOD_MED)

    draw.rectangle((6, 6, CARD_W - 7, CARD_H - 7), outline=GOLD, width=2)
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


def main() -> None:
    cards_dir = os.path.join(OUT_ROOT, "cards")
    os.makedirs(cards_dir, exist_ok=True)

    for suit in SUITS:
        for rank in RANKS:
            card = make_face_card(rank, suit) if rank in FACE_RANKS else make_number_card(rank, suit)
            card.save(os.path.join(cards_dir, f"{suit}_{rank}.png"))

    make_card_back().save(os.path.join(OUT_ROOT, "card_back.png"))
    make_table_felt().save(os.path.join(OUT_ROOT, "table_felt.png"))

    print(f"Generated {len(SUITS) * len(RANKS)} card faces + card back + table felt -> {OUT_ROOT}")


if __name__ == "__main__":
    main()
