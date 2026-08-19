# Graph Report - euchre  (2026-08-18)

## Corpus Check
- 34 files · ~15,207 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 254 nodes · 538 edges · 13 communities (12 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4c24daae`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate_art.py
- RULES.md — Two-Handed Euchre Rules Spec
- reducer.ts
- compilerOptions
- devDependencies
- rules.ts
- types.ts
- Hand A1 (Player A, selected/blind)
- Hand B1 (Player B, selected/blind)
- CLAUDE.md
- useGame.ts
- Art assets — spec

## God Nodes (most connected - your core abstractions)
1. `otherPlayer()` - 16 edges
2. `reduce()` - 16 edges
3. `legalActions()` - 14 edges
4. `make_face_card()` - 13 edges
5. `compilerOptions` - 13 edges
6. `Card` - 12 edges
7. `Player` - 10 edges
8. `chooseMove()` - 10 edges
9. `effectiveSuit()` - 9 edges
10. `trickWinnerIndex()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `Card`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `useGame()` --calls--> `chooseMove()`  [EXTRACTED]
  src/game/useGame.ts → shared/bot/heuristic.ts
- `PlayStateOptions` --references--> `Config`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Player`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (13 total, 1 thin omitted)

### Community 0 - "generate_art.py"
Cohesion: 0.14
Nodes (25): body_color(), draw_body(), draw_card_frame(), draw_face(), draw_glyph(), draw_head(), _ellipse_mask(), main() (+17 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "reducer.ts"
Cohesion: 0.16
Nodes (33): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, DEFAULT_CONFIG, actingHand(), handCards() (+25 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (30): dependencies, react, react-dom, devDependencies, tsx, @types/react, @types/react-dom, typescript (+22 more)

### Community 5 - "rules.ts"
Cohesion: 0.13
Nodes (27): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre, bestSuitByTrumpCount(), byType(), cardsEqual() (+19 more)

### Community 6 - "types.ts"
Cohesion: 0.19
Nodes (15): deal, fullDeck(), RANKS, seededRng(), shuffledDeck(), SUITS, Config, HandRole (+7 more)

### Community 7 - "Hand A1 (Player A, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Hand B1 (Player B, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

### Community 11 - "useGame.ts"
Cohesion: 0.11
Nodes (27): Action, Card, PlayerView, App(), BOT, freshSeed(), HUMAN, useGame() (+19 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.25
Nodes (7): Art assets — spec, Cards, Outline system — the "sticker" look, Output, Palette — cabin by the fire, Regenerating, Table

## Knowledge Gaps
- **63 isolated node(s):** `Palette — cabin by the fire`, `Outline system — the "sticker" look`, `Cards`, `Table`, `Output` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card` connect `useGame.ts` to `reducer.ts`, `rules.ts`, `types.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `Palette — cabin by the fire`, `Outline system — the "sticker" look`, `Cards` to the rest of the system?**
  _63 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate_art.py` be split into smaller, more focused modules?**
  _Cohesion score 0.14408602150537633 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `rules.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1310483870967742 - nodes in this community are weakly interconnected._