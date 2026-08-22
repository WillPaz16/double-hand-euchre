#!/usr/bin/env python3
"""CI determinism check: run generate_art.py twice and confirm every PNG is pixel-identical
across the two runs.

**Compares decoded pixels, never raw file bytes** — ASSETS.md documents why: regenerating
byte-identical images under a different Pillow version can still rewrite the PNG encoding
(observed: every card 40 bytes smaller, `getbbox()` diff of `None`), so an `md5` sweep over
the files reports a false failure the moment the interpreter or library version changes. This
is the same check described there, just invoked as a script instead of a REPL one-liner so CI
can run it.
"""
import glob
import hashlib
import subprocess
import sys
from pathlib import Path

from PIL import Image

ART_DIR = Path(__file__).parent
OUT_ROOT = ART_DIR.parent / "public" / "art"


def hash_all() -> dict[str, str]:
    out = {}
    for p in sorted(glob.glob(str(OUT_ROOT / "**" / "*.png"), recursive=True)):
        out[p] = hashlib.md5(Image.open(p).convert("RGBA").tobytes()).hexdigest()
    return out


def main() -> None:
    subprocess.run([sys.executable, str(ART_DIR / "generate_art.py")], check=True)
    before = hash_all()
    subprocess.run([sys.executable, str(ART_DIR / "generate_art.py")], check=True)
    after = hash_all()

    if before.keys() != after.keys():
        added = after.keys() - before.keys()
        removed = before.keys() - after.keys()
        print(f"FILE SET CHANGED between runs. added={added} removed={removed}")
        sys.exit(1)

    changed = [p for p in before if before[p] != after[p]]
    if changed:
        print(f"NON-DETERMINISTIC: {len(changed)} asset(s) changed on rerun:")
        for p in changed:
            print(f"  {p}")
        sys.exit(1)

    print(f"deterministic: {len(before)} assets pixel-identical across two runs")


if __name__ == "__main__":
    main()
