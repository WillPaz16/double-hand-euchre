# Graph Report - euchre  (2026-08-18)

## Corpus Check
- 19 files · ~7,978 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 146 nodes · 317 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aa271dec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- legal.ts
- RULES.md — Two-Handed Euchre Rules Spec
- reducer.ts
- compilerOptions
- package.json
- rules.ts
- types.ts
- Hand A1 (Player A, selected/blind)
- Hand B1 (Player B, selected/blind)
- Two-Handed Euchre
- CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `otherPlayer()` - 16 edges
2. `reduce()` - 16 edges
3. `legalActions()` - 14 edges
4. `compilerOptions` - 11 edges
5. `Player` - 9 edges
6. `Card` - 9 edges
7. `effectiveSuit()` - 9 edges
8. `deal` - 8 edges
9. `newGame()` - 8 edges
10. `§2 Loner Declaration Windows` - 8 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `Config`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `playRandomDeal()` --calls--> `newGame()`  [EXTRACTED]
  scripts/fuzz.ts → shared/engine/reducer.ts
- `playRandomDeal()` --calls--> `reduce()`  [EXTRACTED]
  scripts/fuzz.ts → shared/engine/reducer.ts
- `playOutHand()` --calls--> `legalActions()`  [EXTRACTED]
  tests/helpers.ts → shared/engine/legal.ts
- `PlayStateOptions` --references--> `Player`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (11 total, 1 thin omitted)

### Community 0 - "legal.ts"
Cohesion: 0.19
Nodes (15): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, SUITS, actingHand(), handCards() (+7 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "reducer.ts"
Cohesion: 0.26
Nodes (19): DEFAULT_CONFIG, otherPlayer(), assertLegal(), buildRing(), cardsEqual(), enterDealerExchange(), enterPlay(), newGame() (+11 more)

### Community 3 - "compilerOptions"
Cohesion: 0.12
Nodes (16): scripts, shared, src, tests, compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames (+8 more)

### Community 4 - "package.json"
Cohesion: 0.13
Nodes (14): devDependencies, tsx, typescript, vitest, name, private, scripts, fuzz (+6 more)

### Community 5 - "rules.ts"
Cohesion: 0.32
Nodes (11): effectiveSuit(), isLeftBower(), isRightBower(), isTrump(), leftBowerSuit(), legalPlays(), PLAIN_RANK_ORDER, SAME_COLOR (+3 more)

### Community 6 - "types.ts"
Cohesion: 0.19
Nodes (17): deal, fullDeck(), RANKS, seededRng(), shuffledDeck(), Action, Card, HandId (+9 more)

### Community 7 - "Hand A1 (Player A, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Hand B1 (Player B, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

### Community 9 - "Two-Handed Euchre"
Cohesion: 0.33
Nodes (5): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre

## Knowledge Gaps
- **38 isolated node(s):** `graphify`, `Status`, `Repo layout`, `Running the engine`, `Knowledge graph` (+33 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `reduce()` connect `reducer.ts` to `legal.ts`, `rules.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `graphify`, `Status`, `Repo layout` to the rest of the system?**
  _38 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._