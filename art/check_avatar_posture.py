"""The three things the round-5 posture pass can break, checked rather than eyeballed.

1. The Old-Timer is byte-identical to the sprite on HEAD. He is the fixed point the other
   three are composed against; every posture knob is an identity at its default, and this is
   what proves it.
2. No sprite has an ENCLOSED transparent hole. Posing opened three of these — hair that
   stopped short of a dropped shoulder, a cheek that stopped short of a raised one. They are
   the worst defect this file ships: at 8x a hole reads as shading, at 1x it is a white notch
   punched through the character.
3. The Kid's head still reads WIDER than her shoulders. It is the strongest child cue in the
   cast, it is a proportion posture can quietly spend, and it is measured here on the rendered
   silhouette (which is what a player sees) rather than on the build numbers.

Run: python3 art/check_avatar_posture.py
"""
import os
import subprocess
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_art as ga  # noqa: E402
from PIL import Image  # noqa: E402

EXPR = ("idle", "happy", "rueful", "blink")


def native(av, expression):
    img = ga.snap_to_pixel_grid(ga.make_avatar(av, expression), ga.PX * ga.CHUNK_ENV)
    w, h = img.size
    return img.resize((w // ga.PX, h // ga.PX), Image.NEAREST).convert("RGBA")


def shipped(key, expression):
    ref = "/tmp/avatar_posture_ref.png"
    with open(ref, "wb") as f:
        subprocess.run(["git", "show", f"HEAD:public/art/avatar_{key}_{expression}.png"],
                       stdout=f, check=True)
    return Image.open(ref).convert("RGBA")


def enclosed_background(img):
    """Transparent pixels the outside cannot flood-fill to."""
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)]
              + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y][x] or px[x, y][3] > 128:
            continue
        seen[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return [(x, y) for y in range(h) for x in range(w)
            if px[x, y][3] <= 128 and not seen[y][x]]


def row_widths(img):
    px = img.load()
    w, h = img.size
    return [sum(1 for x in range(w) if px[x, y][3] > 128) for y in range(h)]


ok = True

print("Old-Timer byte-identity:")
for e in EXPR:
    same = native(ga.AVATARS["old_timer"], e).tobytes() == shipped("old_timer", e).tobytes()
    ok &= same
    print(f"  {e:7s} {'identical' if same else 'CHANGED'}")

print("enclosed background holes:")
holes = 0
for key, av in ga.AVATARS.items():
    for e in EXPR:
        found = enclosed_background(native(av, e))
        if found:
            holes += len(found)
            xs = [p[0] for p in found]
            ys = [p[1] for p in found]
            print(f"  {key} {e}: {len(found)} px, "
                  f"x {min(xs)}..{max(xs)} y {min(ys)}..{max(ys)}")
ok &= holes == 0
print("  none" if not holes else f"  TOTAL {holes} px")

# Head band is the top 55 native rows (skull plus whatever hair or hat sits on it); the
# shoulder line lives in rows 72..92 at every pose in this cast.
print("head / shoulder-line width (rendered, idle):")
for key, av in ga.AVATARS.items():
    now, was = row_widths(native(av, "idle")), row_widths(shipped(key, "idle"))
    hn, sn = max(now[:55]), max(now[72:92])
    hw, sw = max(was[:55]), max(was[72:92])
    flag = ""
    if key == "kid":
        good = hn >= sn
        ok &= good
        flag = "  <- child cue" + ("" if good else "  LOST")
    print(f"  {key:11s} was {hw:3d}/{sw:3d} = {hw / sw:.2f}   "
          f"now {hn:3d}/{sn:3d} = {hn / sn:.2f}{flag}")

print("OK" if ok else "FAILED")
sys.exit(0 if ok else 1)
