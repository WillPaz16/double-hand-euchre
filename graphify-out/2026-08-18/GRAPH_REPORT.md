# Graph Report - euchre  (2026-08-18)

## Corpus Check
- 34 files · ~12,245 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 237 nodes · 507 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0051c63`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate_art.py
- RULES.md — Two-Handed Euchre Rules Spec
- reducer.ts
- compilerOptions
- devDependencies
- rules.ts
- deck.ts
- Hand A1 (Player A, selected/blind)
- Hand B1 (Player B, selected/blind)
- Two-Handed Euchre
- CLAUDE.md
- types.ts
- Art assets — spec

## God Nodes (most connected - your core abstractions)
1. `otherPlayer()` - 16 edges
2. `reduce()` - 16 edges
3. `legalActions()` - 14 edges
4. `compilerOptions` - 13 edges
5. `Card` - 12 edges
6. `Player` - 10 edges
7. `chooseMove()` - 10 edges
8. `effectiveSuit()` - 9 edges
9. `trickWinnerIndex()` - 9 edges
10. `make_face_card()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `Config`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `useGame()` --calls--> `chooseMove()`  [EXTRACTED]
  src/game/useGame.ts → shared/bot/heuristic.ts
- `PlayStateOptions` --references--> `Suit`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Card`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (14 total, 1 thin omitted)

### Community 0 - "generate_art.py"
Cohesion: 0.35
Nodes (14): bitmap_size(), corner_marker(), draw_bitmap(), draw_card_frame(), main(), make_card_back(), make_face_card(), make_number_card() (+6 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "reducer.ts"
Cohesion: 0.15
Nodes (34): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, DEFAULT_CONFIG, SUITS, actingHand() (+26 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (30): dependencies, react, react-dom, devDependencies, tsx, @types/react, @types/react-dom, typescript (+22 more)

### Community 5 - "rules.ts"
Cohesion: 0.18
Nodes (22): bestSuitByTrumpCount(), byType(), cardsEqual(), chooseMove(), countTrump(), findCardAction(), highest(), lowest() (+14 more)

### Community 6 - "deck.ts"
Cohesion: 0.33
Nodes (10): deal, fullDeck(), RANKS, seededRng(), shuffledDeck(), Card, Player, PlayerHands (+2 more)

### Community 7 - "Hand A1 (Player A, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Hand B1 (Player B, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

### Community 9 - "Two-Handed Euchre"
Cohesion: 0.33
Nodes (5): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre

### Community 11 - "types.ts"
Cohesion: 0.10
Nodes (31): Action, HandId, HandRole, LonerTier, Phase, PlayerView, Rank, App() (+23 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.29
Nodes (6): Art assets — spec, Cards, Output, Palette — cabin by the fire, Regenerating, Table

## Knowledge Gaps
- **62 isolated node(s):** `Palette — cabin by the fire`, `Cards`, `Table`, `Output`, `Regenerating` (+57 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card` connect `deck.ts` to `reducer.ts`, `types.ts`, `rules.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `Palette — cabin by the fire`, `Cards`, `Table` to the rest of the system?**
  _62 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `reducer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1475609756097561 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09725158562367865 - nodes in this community are weakly interconnected._