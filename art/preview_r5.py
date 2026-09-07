"""Scratch preview harness for the round-5 posture pass. Not part of the shipped pipeline."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_art as ga  # noqa: E402
from PIL import Image  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
KEYS = ["old_timer", "card_sharp", "kid", "regular"]
EXPR = ["idle", "happy", "rueful", "blink"]


def native(av, e):
    img = ga.make_avatar(av, e)
    ga._assert_sprite_colours(img, f"avatar {av.key} {e}")
    img = ga.snap_to_pixel_grid(img, ga.PX * ga.CHUNK_ENV)
    ga._assert_pixel_grid(img, ga.PX * ga.CHUNK_ENV, label=f"{av.key} {e}")
    w, h = img.size
    return img.resize((w // ga.PX, h // ga.PX), Image.NEAREST)


def grid(cells, cols, scale, path, bg=(26, 20, 18, 255)):
    cw, ch = cells[0].size
    rows = (len(cells) + cols - 1) // cols
    out = Image.new("RGBA", (cw * cols * scale, ch * rows * scale), bg)
    for i, c in enumerate(cells):
        c = c.resize((cw * scale, ch * scale), Image.NEAREST)
        out.alpha_composite(c, ((i % cols) * cw * scale, (i // cols) * ch * scale))
    out.save(path)


def sil(img):
    out = Image.new("RGBA", img.size, (255, 255, 255, 255))
    px = img.load()
    o = out.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            if px[x, y][3] > 128:
                o[x, y] = (0, 0, 0, 255)
    return out


nat = {}
counts = {}
for k in KEYS:
    av = ga.AVATARS[k]
    for e in EXPR:
        raw = ga.make_avatar(av, e)
        counts[(k, e)] = len({p for p in raw.convert("RGBA").getdata() if p[3] > 0})
        nat[(k, e)] = native(av, e)

grid([nat[(k, "idle")] for k in KEYS], 4, 5, os.path.join(OUT, "lineup.png"))
grid([nat[(k, "idle")] for k in KEYS], 4, 1, os.path.join(OUT, "lineup_native.png"))
grid([nat[(k, e)] for k in KEYS for e in EXPR], 4, 4, os.path.join(OUT, "sheet.png"))
grid([sil(nat[(k, "idle")]) for k in KEYS], 4, 5,
     os.path.join(OUT, "silhouette.png"), bg=(255, 255, 255, 255))
grid([sil(nat[(k, "idle")]) for k in KEYS], 4, 1,
     os.path.join(OUT, "silhouette_native.png"), bg=(255, 255, 255, 255))

print("max colours per character:", {k: max(counts[(k, e)] for e in EXPR) for k in KEYS})
