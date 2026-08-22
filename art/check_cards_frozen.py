#!/usr/bin/env python3
"""CI check: confirm the 24 card faces, the three card backs and the scoreboard cards are
pixel-identical to the committed baseline (git HEAD).

**Compares decoded pixels, never raw file bytes, and never via `git diff` on the PNGs.**
A byte-level diff would false-positive constantly in CI: ASSETS.md documents that different
Pillow versions encode identical pixels into different PNG bytes, and CI's Pillow is not
guaranteed to match whatever machine last regenerated the committed assets. `git show
HEAD:path` reads the committed bytes without touching the working tree, decoded straight into
Pillow for a pixel comparison — the same standing rule this repo already applies to its
regenerate-twice determinism check, just applied against the git baseline instead of a second
local run.
"""
import glob
import subprocess
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ART_DIR = Path(__file__).parent
REPO_ROOT = ART_DIR.parent
OUT_ROOT = REPO_ROOT / "public" / "art"

# ASSETS.md rule 6: these are frozen. Everything else in public/art/ is environment art and is
# allowed to change.
FROZEN_GLOBS = [
    "cards/*.png",
    "card_back.png",
    "card_back_seat.png",
    "score_card_back.png",
    "scoreboard/*.png",
]


def pixels_at_head(rel_path: str) -> bytes | None:
    result = subprocess.run(
        ["git", "show", f"HEAD:public/art/{rel_path}"],
        cwd=REPO_ROOT,
        capture_output=True,
    )
    if result.returncode != 0:
        return None  # not tracked at HEAD (a new file) — nothing to compare against
    return Image.open(BytesIO(result.stdout)).convert("RGBA").tobytes()


def main() -> None:
    changed = []
    checked = 0
    for pattern in FROZEN_GLOBS:
        for p in sorted(glob.glob(str(OUT_ROOT / pattern))):
            rel = str(Path(p).relative_to(OUT_ROOT))
            head_px = pixels_at_head(rel)
            if head_px is None:
                continue
            now_px = Image.open(p).convert("RGBA").tobytes()
            checked += 1
            if now_px != head_px:
                changed.append(rel)

    if changed:
        print(f"CARD ART CHANGED — {len(changed)} of {checked} frozen asset(s) differ from HEAD:")
        for rel in changed:
            print(f"  {rel}")
        sys.exit(1)

    print(f"card art frozen: {checked} assets pixel-identical to HEAD")


if __name__ == "__main__":
    main()
