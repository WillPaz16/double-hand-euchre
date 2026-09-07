#!/usr/bin/env python3
"""Fails if any avatar sprite has an ENCLOSED transparent region.

A hole surrounded by opaque pixels is a hole punched through the character: the room behind
shows through her neck or his shoulder. It is invisible in every colour render at every zoom,
because transparent simply reads as whatever is behind it — the Kid shipped with two of them,
one per side, through all four expressions, and nobody caught it by looking at the art.

Flood-fills transparency inward from the border; anything transparent the flood cannot reach is
enclosed, and is a bug rather than a design choice. No avatar in this cast has a deliberate
interior gap, so the threshold is zero.
"""
import os
import sys
from collections import deque

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "art")
KEYS = ("old_timer", "card_sharp", "kid", "regular")
EXPRESSIONS = ("idle", "happy", "rueful", "blink")


def enclosed_transparent(path):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * h for _ in range(w)]
    queue = deque()

    def push(x, y):
        if px[x, y][3] == 0 and not seen[x][y]:
            seen[x][y] = True
            queue.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                push(nx, ny)

    return [
        (x, y)
        for x in range(w)
        for y in range(h)
        if px[x, y][3] == 0 and not seen[x][y]
    ]


def main():
    failures = []
    checked = 0
    for key in KEYS:
        for expression in EXPRESSIONS:
            path = os.path.join(ROOT, f"avatar_{key}_{expression}.png")
            if not os.path.exists(path):
                failures.append(f"{key} {expression}: sprite missing")
                continue
            checked += 1
            holes = enclosed_transparent(path)
            if holes:
                xs = [p[0] for p in holes]
                ys = [p[1] for p in holes]
                failures.append(
                    f"{key} {expression}: {len(holes)} enclosed transparent px "
                    f"(x {min(xs)}-{max(xs)}, y {min(ys)}-{max(ys)})"
                )
    if failures:
        print("avatar holes FAILED:")
        for f in failures:
            print(f"  {f}")
        sys.exit(1)
    print(f"avatar silhouettes solid: {checked} sprites, no enclosed transparency")


if __name__ == "__main__":
    main()
