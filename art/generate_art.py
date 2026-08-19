#!/usr/bin/env python3
"""Deterministically generates every pixel-art asset for the euchre UI from the spec in
ASSETS.md. No AI image generation, no hand-placed pixels to lose track of — just math and
logic, so re-running this script always produces the same output. See ASSETS.md before
editing: change the spec/constants below, not the PNGs in public/art/.
"""
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
CAP_NAVY = (52, 60, 84, 255)  # the Jack's cap — deliberately not suit-colored, so it reads
# as its own garment against all four suit-colored collars.

SUITS = ["clubs", "diamonds", "hearts", "spades"]
RANKS = ["9", "10", "J", "Q", "K", "A"]
RED_SUITS = {"diamonds", "hearts"}
FACE_RANKS = {"J", "Q", "K"}

CARD_W, CARD_H = 40, 56
OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "art")


# --- Outline system --------------------------------------------------------------------- #
# The Balatro-style "sticker" look comes from a solid outline hugging every distinct piece —
# a head, a crown, a suit pip — not from a single outline around the whole card. Each piece is
# rendered as its own small outlined sprite (fill a mask, dilate it, ring = dilated - mask,
# paint outline then fill) and pasted onto the card in the right order/position. This is the
# one general-purpose tool everything below is built from.


def outlined_sprite(w, h, draw_fn, fill, outline=INK, outline_px=1, pad=2):
    """`draw_fn(mask_draw, ox, oy)` must draw one or more fully-opaque (fill=255) primitives
    onto a grayscale mask, offset by (ox, oy) — multiple primitives merge into one seamless
    silhouette with a single outline around the union, which is what a compound shape (a
    heart's two lobes + point, a robe + collar) needs. Returns (sprite, pad); paste at
    (target_x - pad, target_y - pad) so the shape's local (0,0) lands at (target_x, target_y).
    """
    cw, ch = w + pad * 2, h + pad * 2
    mask = Image.new("L", (cw, ch), 0)
    draw_fn(ImageDraw.Draw(mask), pad, pad)
    dilated = mask.filter(ImageFilter.MaxFilter(outline_px * 2 + 1))
    ring = ImageChops.subtract(dilated, mask)

    sprite = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sprite.paste(Image.new("RGBA", (cw, ch), outline), (0, 0), ring)
    sprite.paste(Image.new("RGBA", (cw, ch), fill), (0, 0), mask)
    return sprite, pad


def paste(card: Image.Image, sprite_and_pad, x: int, y: int) -> None:
    sprite, pad = sprite_and_pad
    card.paste(sprite, (round(x - pad), round(y - pad)), sprite)


PIP_FILL_BLACK = (72, 54, 42, 255)  # a "soot brown" — dark like ink, but visibly distinct from
# the INK outline. Reusing INK as both fill and outline made clubs/spades disappear into their
# own outline entirely; text (which is never outlined) can stay true black.


def text_color(suit: str):
    """For the un-outlined corner rank glyph — wants maximum contrast against parchment."""
    return RED if suit in RED_SUITS else INK


def body_color(suit: str):
    """For anything outlined (pips, the robe/shoulders) — needs to differ from the INK
    outline itself, which pure black/INK does not."""
    return RED if suit in RED_SUITS else PIP_FILL_BLACK


# --- Tiny bold 5x7 bitmap font — only the glyphs a euchre deck needs. --- #
GLYPHS = {
    "9": [
        ".###.",
        "#...#",
        "#...#",
        ".####",
        "....#",
        "...#.",
        ".##..",
    ],
    "1": [
        "..#..",
        ".##..",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
        ".###.",
    ],
    "0": [
        ".###.",
        "#...#",
        "#...#",
        "#...#",
        "#...#",
        "#...#",
        ".###.",
    ],
    "J": [
        "...#.",
        "...#.",
        "...#.",
        "...#.",
        "...#.",
        "#..#.",
        ".##..",
    ],
    "Q": [
        ".###.",
        "#...#",
        "#...#",
        "#...#",
        "#.#.#",
        "#..#.",
        ".##.#",
    ],
    "K": [
        "#...#",
        "#..#.",
        "#.#..",
        "##...",
        "#.#..",
        "#..#.",
        "#...#",
    ],
    "A": [
        "..#..",
        ".#.#.",
        "#...#",
        "#...#",
        "#####",
        "#...#",
        "#...#",
    ],
}


def draw_glyph(draw: ImageDraw.ImageDraw, x: int, y: int, glyph, color) -> None:
    for row_i, row in enumerate(glyph):
        for col_i, ch in enumerate(row):
            if ch == "#":
                draw.point((x + col_i, y + row_i), fill=color)


# --- Suit pips — real geometry (overlapping circles/polygons), not hand-typed bitmaps, so the
# curves are actually round. One mask function per suit; outlined_sprite() gives every pip
# (corner-mini or center-large) the same sticker outline at whatever size it's drawn. --- #


def _heart_mask(w, h):
    def draw_fn(d, ox, oy):
        r = w * 0.3
        lobe_cy = oy + h * 0.36
        left_cx, right_cx = ox + w * 0.28, ox + w * 0.72
        d.ellipse((left_cx - r, lobe_cy - r, left_cx + r, lobe_cy + r), fill=255)
        d.ellipse((right_cx - r, lobe_cy - r, right_cx + r, lobe_cy + r), fill=255)
        d.polygon([(ox, lobe_cy), (ox + w, lobe_cy), (ox + w / 2, oy + h)], fill=255)

    return draw_fn


def _spade_mask(w, h):
    def draw_fn(d, ox, oy):
        r = w * 0.3
        lobe_cy = oy + h * 0.48
        left_cx, right_cx = ox + w * 0.28, ox + w * 0.72
        d.ellipse((left_cx - r, lobe_cy - r, left_cx + r, lobe_cy + r), fill=255)
        d.ellipse((right_cx - r, lobe_cy - r, right_cx + r, lobe_cy + r), fill=255)
        d.polygon([(ox, lobe_cy), (ox + w, lobe_cy), (ox + w / 2, oy)], fill=255)
        stem_w = max(1.0, w * 0.16)
        cx = ox + w / 2
        d.rectangle((cx - stem_w / 2, lobe_cy + r * 0.5, cx + stem_w / 2, oy + h), fill=255)

    return draw_fn


def _diamond_mask(w, h):
    def draw_fn(d, ox, oy):
        cx, cy = ox + w / 2, oy + h / 2
        d.polygon([(cx, oy), (ox + w, cy), (cx, oy + h), (ox, cy)], fill=255)

    return draw_fn


def _club_mask(w, h):
    def draw_fn(d, ox, oy):
        r = w * 0.27
        top = (ox + w / 2, oy + h * 0.3)
        left = (ox + w * 0.26, oy + h * 0.58)
        right = (ox + w * 0.74, oy + h * 0.58)
        for cx, cy in (top, left, right):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        stem_w = max(1.0, w * 0.18)
        cx = ox + w / 2
        d.rectangle((cx - stem_w / 2, oy + h * 0.62, cx + stem_w / 2, oy + h), fill=255)

    return draw_fn


PIP_MASKS = {"hearts": _heart_mask, "diamonds": _diamond_mask, "spades": _spade_mask, "clubs": _club_mask}


def pip_sprite(suit: str, size: int, fill, outline_px=1):
    return outlined_sprite(size, size, PIP_MASKS[suit](size, size), fill, outline_px=outline_px)


def draw_card_frame(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), fill=PARCHMENT)
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=INK)
    draw.rectangle((1, 1, CARD_W - 2, CARD_H - 2), outline=PARCHMENT_SHADOW)


def paste_corners(card: Image.Image, rank: str, suit: str, pip_size=7) -> None:
    text, body = text_color(suit), body_color(suit)
    pip_img, pip_pad = pip_sprite(suit, pip_size, body)

    if rank == "10":
        glyph_w = 5 + 1 + 5
    else:
        glyph_w = 5
    glyph_h = 7
    block_w = max(glyph_w, pip_img.width)
    block_h = glyph_h + 1 + pip_img.height

    marker = Image.new("RGBA", (block_w, block_h), (0, 0, 0, 0))
    mdraw = ImageDraw.Draw(marker)
    if rank == "10":
        draw_glyph(mdraw, 0, 0, GLYPHS["1"], text)
        draw_glyph(mdraw, 6, 0, GLYPHS["0"], text)
    else:
        draw_glyph(mdraw, 0, 0, GLYPHS[rank], text)
    marker.paste(pip_img, ((block_w - pip_img.width) // 2, glyph_h + 1), pip_img)

    card.paste(marker, (2, 2), marker)
    flipped = marker.rotate(180)
    card.paste(flipped, (CARD_W - block_w - 2, CARD_H - block_h - 2), flipped)


def make_number_card(rank: str, suit: str) -> Image.Image:
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw_card_frame(draw)

    sprite = pip_sprite(suit, 20, body_color(suit), outline_px=2)
    paste(card, sprite, CARD_W / 2 - 10, CARD_H / 2 - 10)

    paste_corners(card, rank, suit)
    return card


# --- Face-card portraits ----------------------------------------------------------------- #
# Chibi proportions (big head, small body), thick outlines on every piece, and a simple
# expressive face (round eyes with a highlight, brows, blush, a mouth) — the Pokemon/Balatro
# side of the brief. Suit-colored robe ties each portrait back to its suit, same as the pips.

CX = CARD_W // 2
HEAD_CY = 24
HEAD_R = 7


def _ellipse_mask(w, h):
    def draw_fn(d, ox, oy):
        d.ellipse((ox, oy, ox + w, oy + h), fill=255)

    return draw_fn


def draw_shoulders(card: Image.Image, color) -> None:
    top_y, bottom_y = HEAD_CY + HEAD_R - 4, HEAD_CY + HEAD_R + 8
    half_top, half_bottom = 7, 10
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
    # Collar trim, drawn straight onto the card (small enough not to need its own outline).
    draw = ImageDraw.Draw(card)
    draw.line((CX - half_top + 1, top_y + 1, CX + half_top - 1, top_y + 1), fill=GOLD)


def draw_head(card: Image.Image) -> None:
    sprite = outlined_sprite(HEAD_R * 2, HEAD_R * 2, _ellipse_mask(HEAD_R * 2, HEAD_R * 2), SKIN)
    paste(card, sprite, CX - HEAD_R, HEAD_CY - HEAD_R)


def draw_face(card: Image.Image, brow_color, brow_angle=0, smile=True) -> None:
    """Eyes with a sparkle highlight, brows, blush, a mouth. `brow_angle`: -1 tilts the left
    brow up / right down (a sly, asymmetric look), 0 is level, 1 is a stern V (furrowed)."""
    draw = ImageDraw.Draw(card)
    eye_y = HEAD_CY - 1
    for side in (-1, 1):
        ex = CX + side * 3
        draw.ellipse((ex - 1, eye_y - 1, ex + 1, eye_y + 2), fill=INK)
        draw.point((ex - 1, eye_y - 1), fill=(255, 255, 255, 255))

    brow_y = HEAD_CY - 4
    if brow_angle == 0:
        draw.line((CX - 5, brow_y, CX - 2, brow_y), fill=brow_color, width=1)
        draw.line((CX + 2, brow_y, CX + 5, brow_y), fill=brow_color, width=1)
    elif brow_angle > 0:  # furrowed — inner ends dip down, a stern King look
        draw.line((CX - 5, brow_y - 1, CX - 2, brow_y + 1), fill=brow_color, width=1)
        draw.line((CX + 2, brow_y + 1, CX + 5, brow_y - 1), fill=brow_color, width=1)
    else:  # one raised — a cheeky, asymmetric Jack look
        draw.line((CX - 5, brow_y, CX - 2, brow_y - 2), fill=brow_color, width=1)
        draw.line((CX + 2, brow_y + 1, CX + 5, brow_y + 1), fill=brow_color, width=1)

    for side in (-1, 1):
        bx = CX + side * 5
        draw.point((bx, HEAD_CY + 3), fill=BLUSH)
        draw.point((bx + side, HEAD_CY + 3), fill=BLUSH)

    mouth_y = HEAD_CY + 4
    if smile:
        draw.arc((CX - 3, mouth_y - 3, CX + 3, mouth_y + 2), start=20, end=160, fill=INK)
    else:
        draw.line((CX - 2, mouth_y, CX + 2, mouth_y), fill=INK)


def make_face_card(rank: str, suit: str) -> Image.Image:
    """Each rank is an actual small chibi portrait, not a letter in a box: the King is old and
    grizzled (a nod to the single-player opponent) with a crown, bushy brows and a beard; the
    Queen has flowing hair, a circlet and a gentle smile; the Jack — a knave, not royalty — has
    a tilted cap, a feather and a cheeky raised brow. Every piece (head, hair, crown, robe) is
    its own outlined sprite, composited in the right order — that layered look is the point."""
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw_card_frame(draw)
    color = body_color(suit)

    if rank == "K":
        draw_shoulders(card, color)
        draw_head(card)
        beard_top = HEAD_CY + 3
        beard_w, beard_h = 12, 11

        def beard_fn(d, ox, oy):
            d.polygon([(ox, oy), (ox + beard_w, oy), (ox + beard_w / 2, oy + beard_h)], fill=255)

        paste(card, outlined_sprite(beard_w, beard_h, beard_fn, BEARD_GRAY), CX - beard_w / 2, beard_top)
        draw_face(card, BEARD_GRAY, brow_angle=1, smile=False)

        crown_w, crown_h = 17, 9
        crown_base = HEAD_CY - HEAD_R - 1

        def crown_fn(d, ox, oy):
            d.polygon(
                [
                    (ox, oy + crown_h),
                    (ox, oy + crown_h - 4),
                    (ox + crown_w * 0.25, oy + crown_h - 1),
                    (ox + crown_w * 0.5, oy),
                    (ox + crown_w * 0.75, oy + crown_h - 1),
                    (ox + crown_w, oy + crown_h - 4),
                    (ox + crown_w, oy + crown_h),
                ],
                fill=255,
            )

        paste(card, outlined_sprite(crown_w, crown_h, crown_fn, GOLD), CX - crown_w / 2, crown_base - crown_h)
        draw2 = ImageDraw.Draw(card)
        draw2.point((CX, crown_base - crown_h + 1), fill=GOLD_DARK)

    elif rank == "Q":
        hair_w, hair_h = 8, 17
        for side in (-1, 1):
            hx = CX + side * (HEAD_R + 1) - hair_w / 2
            paste(card, outlined_sprite(hair_w, hair_h, _ellipse_mask(hair_w, hair_h), HAIR_AUBURN), hx, HEAD_CY - 5)
        draw_shoulders(card, color)
        draw_head(card)
        draw_face(card, HAIR_AUBURN, brow_angle=0, smile=True)

        band_y = HEAD_CY - HEAD_R + 2
        draw2 = ImageDraw.Draw(card)
        draw2.line((CX - 5, band_y, CX + 5, band_y), fill=GOLD_DARK, width=1)
        draw2.line((CX - 5, band_y - 1, CX + 5, band_y - 1), fill=GOLD, width=1)
        draw2.point((CX, band_y - 3), fill=GOLD)
        draw2.point((CX, band_y - 2), fill=GOLD_DARK)

    else:  # J — no crown, just a cap and one raised eyebrow.
        draw_shoulders(card, color)
        draw_head(card)
        draw_face(card, INK_LIGHT, brow_angle=-1, smile=True)

        cap_w, cap_h = 15, 8
        cap_top = HEAD_CY - HEAD_R - 4

        def cap_fn(d, ox, oy):
            d.ellipse((ox, oy, ox + cap_w, oy + cap_h), fill=255)

        paste(card, outlined_sprite(cap_w, cap_h, cap_fn, CAP_NAVY), CX - cap_w * 0.35, cap_top)
        draw2 = ImageDraw.Draw(card)
        draw2.line((CX + cap_w * 0.35, cap_top + 1, CX + cap_w * 0.35 + 6, cap_top - 6), fill=GOLD, width=1)

    paste_corners(card, rank, suit)
    return card


def make_card_back() -> Image.Image:
    img = Image.new("RGBA", (CARD_W, CARD_H), WOOD_DARK)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=(0, 0, 0, 255))

    step = 6
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

    draw.rectangle((3, 3, CARD_W - 4, CARD_H - 4), outline=GOLD)
    return img


def make_table_felt() -> Image.Image:
    size = 64
    img = Image.new("RGBA", (size, size), WOOD_MED)
    draw = ImageDraw.Draw(img)

    # Plank seams — divide the tile into three boards.
    for seam_x in (21, 43):
        draw.line((seam_x, 0, seam_x, size), fill=WOOD_DARK)
        draw.line((seam_x + 1, 0, seam_x + 1, size), fill=WOOD_LIGHT)

    # Wood grain: short irregular dashes rather than full-width stripes, so it reads as grain,
    # not corrugation. Placement comes from fixed arithmetic (not randomness), so the tile
    # stays byte-identical across runs.
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
