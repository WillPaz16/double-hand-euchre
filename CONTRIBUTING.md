# Contributing

This is a small project with a clear shape; the fastest way in is to read
[`shared/engine/`](shared/engine) (the whole game, as a pure TypeScript reducer) and
[RULES.md](RULES.md) (the spec the tests cite by section number).

## Setup

```bash
npm install
npm run dev          # the game, http://localhost:5173
npm test             # unit and component tests
```

Node 22+. Python 3.11+ and `pip install -r art/requirements.txt` only if you touch the art.

## Before you open a pull request

CI runs all of this, so it's quickest to run it first:

```bash
npm run typecheck && npm run typecheck:worker
npm test
npm run fuzz         # 10,000 random deals
npm run audit        # layout audit across 11 screen sizes (needs Playwright's Chromium)
```

## Ground rules

- **A rules change starts in [RULES.md](RULES.md).** Change the spec, then the engine, then add a
  test that cites the section.
- **The engine stays pure**: no DOM, no network, no `Math.random()` or `Date.now()`. Games must
  replay exactly from a seed.
- **Art is generated, not drawn.** Change `art/generate_art.py` and regenerate; don't edit PNGs.
  The art checks fail if two runs differ or the card faces change.
- Pixel art renders at whole-number scales only; `npm run audit` enforces it.

## Bugs and ideas

Open an issue with the templates provided. For a rules question, say which section of RULES.md
you read.
