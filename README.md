# Double-Hand Euchre

*The euchre you know and love, but you only have one friend.*

Not to be confused with "two-handed euchre", which is the established name for a different
game: two players, one hand each ([Euchre variants](https://en.wikipedia.org/wiki/Euchre_variants)).
Here each player plays **both** hands of a partnership.

A two-player variant of euchre that we invented, built as a web app so we can play it
together — with a future single-player mode against a bot trained via self-play.

Each player controls two hands (dealt blind, selected before either is seen), which
structurally makes this 4-handed euchre where one player plays both seats of each
"partnership." Full mechanics, including the escalating loner ladder, are in
[RULES.md](RULES.md).

## Status

- **Phase 0 — Rules spec:** done. See [RULES.md](RULES.md).
- **Phase 1 — Headless rules engine:** done. Pure TypeScript engine in `shared/engine/`,
  covered by a Vitest suite and a 10,000-deal fuzz test.
- **Phase 2 — Single-player UI, deployed:** not started.

The full architecture and phase roadmap live in the project's Claude plan file (not
tracked in this repo). Deploy and local-development instructions are in [DEPLOY.md](DEPLOY.md).

## Repo layout

```
RULES.md            canonical rules spec
shared/engine/       pure TS rules engine (types, deck, rules, reducer, legal, view)
tests/                Vitest suite
scripts/fuzz.ts       10k-random-deal robustness check
graphify-out/         generated knowledge graph of this codebase (see below)
```

## Running the engine

```bash
npm install
npm test           # Vitest suite
npm run fuzz        # 10,000 random-legal-action deals, checks for crashes
```

## Knowledge graph

This repo is indexed with [graphify](https://github.com/safishamsi/graphify) into
`graphify-out/` — an interactive graph of every module, function, and rule cross-reference,
including links from the code back to the specific `RULES.md` section it implements. Open
`graphify-out/graph.html` in a browser to explore it. It rebuilds automatically after every
commit via a git hook.
