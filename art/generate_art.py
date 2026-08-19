#!/usr/bin/env python3
"""Deterministically generates every pixel-art asset for the euchre UI from the spec in
ASSETS.md. No AI image generation, no hand-placed pixels to lose track of — just math and
logic, so re-running this script always produces the same output. See ASSETS.md before
editing: change the spec/constants below, not the PNGs in public/art/.
"""
import os

from PIL import Image, ImageDraw

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
SKIN = (222, 175, 130, 255)
BEARD_GRAY = (160, 152, 140, 255)  # the King is old and grizzled — same spirit as the
# single-player opponent — rather than a generic storybook king.
HAIR_AUBURN = (120, 64, 34, 255)
CAP_NAVY = (52, 60, 74, 255)  # the Jack's cap — deliberately not suit-colored, so it reads
# as its own garment against all four suit-colored collars.

SUITS = ["clubs", "diamonds", "hearts", "spades"]
RANKS = ["9", "10", "J", "Q", "K", "A"]
RED_SUITS = {"diamonds", "hearts"}
FACE_RANKS = {"J", "Q", "K"}

CARD_W, CARD_H = 40, 56
OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "art")

# --- Tiny 4x6 bitmap font — only the glyphs a euchre deck needs. --- #
GLYPHS = {
    "9": [
        ".##.",
        "#..#",
        "#..#",
        ".###",
        "...#",
        "..#.",
    ],
    "1": [
        ".#..",
        "##..",
        ".#..",
        ".#..",
        ".#..",
        "###.",
    ],
    "0": [
        ".##.",
        "#..#",
        "#..#",
        "#..#",
        "#..#",
        ".##.",
    ],
    "J": [
        "..#.",
        "..#.",
        "..#.",
        "..#.",
        "#.#.",
        ".#..",
    ],
    "Q": [
        ".##.",
        "#..#",
        "#..#",
        "#..#",
        ".##.",
        "...#",
    ],
    "K": [
        "#..#",
        "#.#.",
        "##..",
        "#.#.",
        "#..#",
        "#..#",
    ],
    "A": [
        ".##.",
        "#..#",
        "#..#",
        "####",
        "#..#",
        "#..#",
    ],
}

# --- Suit pips, drawn as real geometry (overlapping circles/polygons) rather than hand-typed
# bitmaps, so the curves are actually round and the proportions hold at any size — a mini
# corner pip and a large center pip come from the same function, just a different box. --- #


def draw_diamond_pip(draw: ImageDraw.ImageDraw, box, color) -> None:
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    draw.polygon([(cx, y0), (x1, cy), (cx, y1), (x0, cy)], fill=color)


def draw_heart_pip(draw: ImageDraw.ImageDraw, box, color) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    r = w * 0.28
    lobe_cy = y0 + h * 0.34
    left_cx, right_cx = x0 + w * 0.28, x0 + w * 0.72
    draw.ellipse((left_cx - r, lobe_cy - r, left_cx + r, lobe_cy + r), fill=color)
    draw.ellipse((right_cx - r, lobe_cy - r, right_cx + r, lobe_cy + r), fill=color)
    draw.polygon([(x0, lobe_cy), (x1, lobe_cy), ((x0 + x1) / 2, y1)], fill=color)


def draw_spade_pip(draw: ImageDraw.ImageDraw, box, color) -> None:
    """A heart flipped point-up, plus a stem — the classic spade/heart relationship."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    body_bottom = y0 + h * 0.78
    r = w * 0.28
    lobe_cy = y0 + h * 0.5
    left_cx, right_cx = x0 + w * 0.28, x0 + w * 0.72
    draw.ellipse((left_cx - r, lobe_cy - r, left_cx + r, lobe_cy + r), fill=color)
    draw.ellipse((right_cx - r, lobe_cy - r, right_cx + r, lobe_cy + r), fill=color)
    draw.polygon([(x0, lobe_cy), (x1, lobe_cy), ((x0 + x1) / 2, y0)], fill=color)
    cx = (x0 + x1) / 2
    stem_w = max(1.0, w * 0.14)
    draw.rectangle((cx - stem_w / 2, body_bottom - 1, cx + stem_w / 2, y1), fill=color)


def draw_club_pip(draw: ImageDraw.ImageDraw, box, color) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    r = w * 0.26
    top_cx, top_cy = (x0 + x1) / 2, y0 + h * 0.3
    left_cx, left_cy = x0 + w * 0.26, y0 + h * 0.58
    right_cx, right_cy = x0 + w * 0.74, y0 + h * 0.58
    for cx, cy in ((top_cx, top_cy), (left_cx, left_cy), (right_cx, right_cy)):
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    cx = (x0 + x1) / 2
    stem_w = max(1.0, w * 0.16)
    draw.rectangle((cx - stem_w / 2, y0 + h * 0.62, cx + stem_w / 2, y1), fill=color)


PIP_DRAWERS = {
    "hearts": draw_heart_pip,
    "diamonds": draw_diamond_pip,
    "spades": draw_spade_pip,
    "clubs": draw_club_pip,
}


def draw_pip(draw: ImageDraw.ImageDraw, box, suit: str, color) -> None:
    PIP_DRAWERS[suit](draw, box, color)


def suit_color(suit: str):
    return RED if suit in RED_SUITS else INK


def draw_bitmap(draw: ImageDraw.ImageDraw, x: int, y: int, bitmap, color, skip=".") -> None:
    for row_i, row in enumerate(bitmap):
        for col_i, ch in enumerate(row):
            if ch != skip:
                draw.point((x + col_i, y + row_i), fill=color)


def corner_marker(rank: str, suit: str) -> Image.Image:
    """Rank glyph stacked over a mini suit pip — the top-left corner mark. Mirrored 180° for
    the bottom-right corner by the caller."""
    color = suit_color(suit)
    pip_w, pip_h = 6, 6
    glyph_w = 4 + 1 + 4 if rank == "10" else 4  # '1' + gap + '0' when two digits
    glyph_h = 6

    w = max(glyph_w, pip_w)
    h = glyph_h + 1 + pip_h
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if rank == "10":
        draw_bitmap(draw, 0, 0, GLYPHS["1"], color)
        draw_bitmap(draw, 5, 0, GLYPHS["0"], color)
    else:
        draw_bitmap(draw, 0, 0, GLYPHS[rank], color)

    pip_x = (w - pip_w) // 2
    draw_pip(draw, (pip_x, glyph_h + 1, pip_x + pip_w, glyph_h + 1 + pip_h), suit, color)
    return img


def paste_corners(card: Image.Image, rank: str, suit: str) -> None:
    marker = corner_marker(rank, suit)
    card.paste(marker, (2, 2), marker)
    flipped = marker.rotate(180)
    card.paste(flipped, (CARD_W - marker.width - 2, CARD_H - marker.height - 2), flipped)


def draw_card_frame(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), fill=PARCHMENT)
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=INK)
    draw.rectangle((1, 1, CARD_W - 2, CARD_H - 2), outline=PARCHMENT_SHADOW)


def make_number_card(rank: str, suit: str) -> Image.Image:
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw_card_frame(draw)

    color = suit_color(suit)
    size = 20
    box = ((CARD_W - size) / 2, (CARD_H - size) / 2, (CARD_W + size) / 2, (CARD_H + size) / 2)
    draw_pip(draw, box, suit, color)

    paste_corners(card, rank, suit)
    return card


def draw_bust(draw: ImageDraw.ImageDraw, cx: int, head_cy: int, head_r: int, shoulder_color):
    """Shoulders (drawn first, behind the head) + a skin-toned head with two eyes. Returns the
    shoulder y-bounds so callers can react to them."""
    shoulder_top_y = head_cy + head_r - 1
    shoulder_bottom_y = shoulder_top_y + 12
    half_top, half_bottom = head_r, head_r + 5
    draw.polygon(
        [
            (cx - half_top, shoulder_top_y),
            (cx + half_top, shoulder_top_y),
            (cx + half_bottom, shoulder_bottom_y),
            (cx - half_bottom, shoulder_bottom_y),
        ],
        fill=shoulder_color,
    )
    draw.line((cx - half_top, shoulder_top_y, cx + half_top, shoulder_top_y), fill=GOLD)
    draw.ellipse((cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r), fill=SKIN, outline=INK)
    draw.point((cx - 2, head_cy - 1), fill=INK)
    draw.point((cx + 2, head_cy - 1), fill=INK)
    return shoulder_top_y, shoulder_bottom_y


def make_face_card(rank: str, suit: str) -> Image.Image:
    """Each rank gets an actual small bust portrait rather than a letter in a box: the King is
    old and grizzled (a nod to the single-player opponent) with a crown and beard, the Queen
    has a circlet and flowing hair, the Jack — a knave, not royalty — just a rakish cap and
    feather. Same silhouette-differentiation idea as before, now built from a real head and
    shoulders instead of an abstract emblem."""
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw_card_frame(draw)

    color = suit_color(suit)
    cx, head_cy, head_r = CARD_W // 2, 21, 5

    if rank == "K":
        shoulder_top_y, _ = draw_bust(draw, cx, head_cy, head_r, color)
        chin_y = head_cy + head_r - 1
        draw.polygon([(cx - 4, chin_y), (cx + 4, chin_y), (cx, chin_y + 6)], fill=BEARD_GRAY)
        crown_y = head_cy - head_r - 1
        draw.polygon(
            [
                (cx - 6, crown_y),
                (cx - 6, crown_y - 4),
                (cx - 3, crown_y - 1),
                (cx, crown_y - 5),
                (cx + 3, crown_y - 1),
                (cx + 6, crown_y - 4),
                (cx + 6, crown_y),
            ],
            fill=GOLD,
        )
        draw.rectangle((cx - 6, crown_y - 1, cx + 6, crown_y + 1), fill=GOLD)

    elif rank == "Q":
        draw_bust(draw, cx, head_cy, head_r, color)
        draw.ellipse((cx - 7, head_cy - 3, cx - 3, head_cy + 7), fill=HAIR_AUBURN)
        draw.ellipse((cx + 3, head_cy - 3, cx + 7, head_cy + 7), fill=HAIR_AUBURN)
        draw.line((cx - 4, head_cy - 5, cx + 4, head_cy - 5), fill=GOLD)
        draw.point((cx, head_cy - 6), fill=GOLD)

    else:  # J — a knave, not royalty: no crown, just a cap and a bit of swagger.
        draw_bust(draw, cx, head_cy, head_r, color)
        draw.ellipse((cx - 6, head_cy - 9, cx + 4, head_cy - 3), fill=CAP_NAVY)
        draw.line((cx + 3, head_cy - 8, cx + 8, head_cy - 14), fill=GOLD)

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
