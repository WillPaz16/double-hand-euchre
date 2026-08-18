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

# --- Suit pip bitmaps, 7x7. --- #
PIPS = {
    "hearts": [
        ".#.#.#.",
        "#######",
        "#######",
        ".#####.",
        "..###..",
        "...#...",
        ".......",
    ],
    "diamonds": [
        "...#...",
        "..###..",
        ".#####.",
        "#######",
        ".#####.",
        "..###..",
        "...#...",
    ],
    "spades": [
        "...#...",
        "..###..",
        ".#####.",
        "#######",
        "#######",
        "..#.#..",
        "...#...",
    ],
    "clubs": [
        "..###..",
        ".#####.",
        "..###..",
        "#.###.#",
        "#######",
        "..#.#..",
        "...#...",
    ],
}

# --- Face-card accessory bitmaps, 9x5, drawn above the rank letter. --- #
ACCESSORIES = {
    "K": [  # crown
        "#.#.#.#.#",
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
    ],
    "Q": [  # circlet
        ".........",
        ".#.#.#.#.",
        "#########",
        ".........",
        ".........",
    ],
    "J": [  # cap
        "...####..",
        "..######.",
        ".########",
        "#########",
        ".........",
    ],
}


def suit_color(suit: str):
    return RED if suit in RED_SUITS else INK


def draw_bitmap(draw: ImageDraw.ImageDraw, x: int, y: int, bitmap, color, skip=".") -> None:
    for row_i, row in enumerate(bitmap):
        for col_i, ch in enumerate(row):
            if ch != skip:
                draw.point((x + col_i, y + row_i), fill=color)


def bitmap_size(bitmap):
    return len(bitmap[0]), len(bitmap)


def corner_marker(rank: str, suit: str) -> Image.Image:
    """Rank glyph stacked over a mini suit pip — the top-left corner mark. Mirrored 180° for
    the bottom-right corner by the caller."""
    color = suit_color(suit)
    mini_pip = [row[1:6] for row in PIPS[suit][1:6]]  # crop the 7x7 pip down to a 5x5 mini
    pip_w, pip_h = bitmap_size(mini_pip)
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

    draw_bitmap(draw, 0, glyph_h + 1, mini_pip, color)
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
    pip = PIPS[suit]
    pw, ph = bitmap_size(pip)
    scale = 2  # center pip drawn at 2x for presence
    big = Image.new("RGBA", (pw * scale, ph * scale), (0, 0, 0, 0))
    big_draw = ImageDraw.Draw(big)
    for row_i, row in enumerate(pip):
        for col_i, ch in enumerate(row):
            if ch == "#":
                big_draw.rectangle(
                    (col_i * scale, row_i * scale, col_i * scale + scale - 1, row_i * scale + scale - 1),
                    fill=color,
                )
    card.paste(big, ((CARD_W - big.width) // 2, (CARD_H - big.height) // 2), big)

    paste_corners(card, rank, suit)
    return card


def make_face_card(rank: str, suit: str) -> Image.Image:
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw_card_frame(draw)

    color = suit_color(suit)

    # Emblem box.
    box = (7, 14, CARD_W - 8, CARD_H - 15)
    draw.rectangle(box, outline=color)
    draw.rectangle((box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1), outline=GOLD)

    accessory = ACCESSORIES[rank]
    aw, ah = bitmap_size(accessory)
    ax = (CARD_W - aw) // 2
    draw_bitmap(draw, ax, box[1] + 4, accessory, GOLD)

    glyph = GLYPHS[rank]
    gw, gh = bitmap_size(glyph)
    gx = (CARD_W - gw) // 2
    draw_bitmap(draw, gx, box[1] + 4 + ah + 3, glyph, color)

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
