"""Builds public/og.png, the 1200x630 image shown when the game's link is shared.

It is a crop of docs/screenshots/play.png, so it needs no art of its own: when the screenshots
are refreshed, run this again and the preview follows. Deterministic (fixed crop, fixed resample).

    python3 art/make_social_preview.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630

src = Image.open(ROOT / "docs/screenshots/play.png").convert("RGB")
# Full width, cropped to the 1200:630 aspect, starting at the very top so the status banner, the
# opponent's head, the felt, and the card on the table are all in frame.
crop_h = round(src.width * H / W)
top = 0
img = src.crop((0, top, src.width, top + crop_h)).resize((W, H), Image.LANCZOS)
img.save(ROOT / "public/og.png", optimize=True)
print(f"wrote public/og.png {img.size}")
