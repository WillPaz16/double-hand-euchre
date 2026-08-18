# Graph Report - euchre  (2026-08-18)

## Corpus Check
- Corpus is ~7,590 words - fits in a single context window. You may not need a graph.

## Summary
- 138 nodes · 310 edges · 9 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.75)
- Token cost: 64,424 input · 0 output

## Community Hubs (Navigation)
- Core State Machine & Fuzzing
- Rules Spec Sections
- Deal Lifecycle & Testing
- TypeScript Build Config
- NPM Package & Tooling
- Trump & Trick Rules
- Deck & Dealing
- Player A's Hands
- Player B's Hands

## God Nodes (most connected - your core abstractions)
1. `otherPlayer()` - 16 edges
2. `reduce()` - 16 edges
3. `legalActions()` - 14 edges
4. `compilerOptions` - 11 edges
5. `effectiveSuit()` - 9 edges
6. `Player` - 9 edges
7. `Card` - 9 edges
8. `deal` - 8 edges
9. `newGame()` - 8 edges
10. `RULES.md — Two-Handed Euchre Rules Spec` - 8 edges

## Surprising Connections (you probably didn't know these)
- `playRandomDeal()` --calls--> `newGame()`  [EXTRACTED]
  scripts/fuzz.ts → shared/engine/reducer.ts
- `playRandomDeal()` --calls--> `reduce()`  [EXTRACTED]
  scripts/fuzz.ts → shared/engine/reducer.ts
- `playOutHand()` --calls--> `legalActions()`  [EXTRACTED]
  tests/helpers.ts → shared/engine/legal.ts
- `PlayStateOptions` --references--> `Player`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Card`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (9 total, 0 thin omitted)

### Community 0 - "Core State Machine & Fuzzing"
Cohesion: 0.17
Nodes (22): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, actingHand(), handCards(), legalActions() (+14 more)

### Community 1 - "Rules Spec Sections"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "Deal Lifecycle & Testing"
Cohesion: 0.22
Nodes (20): DEFAULT_CONFIG, otherPlayer(), buildRing(), enterDealerExchange(), enterPlay(), newGame(), nextDeal(), reduce() (+12 more)

### Community 3 - "TypeScript Build Config"
Cohesion: 0.12
Nodes (16): scripts, shared, src, tests, compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames (+8 more)

### Community 4 - "NPM Package & Tooling"
Cohesion: 0.13
Nodes (14): devDependencies, tsx, typescript, vitest, name, private, scripts, fuzz (+6 more)

### Community 5 - "Trump & Trick Rules"
Cohesion: 0.32
Nodes (11): effectiveSuit(), isLeftBower(), isRightBower(), isTrump(), leftBowerSuit(), legalPlays(), PLAIN_RANK_ORDER, SAME_COLOR (+3 more)

### Community 6 - "Deck & Dealing"
Cohesion: 0.33
Nodes (9): deal, fullDeck(), RANKS, seededRng(), shuffledDeck(), SUITS, Card, PlayerHands (+1 more)

### Community 7 - "Player A's Hands"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Player B's Hands"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

## Knowledge Gaps
- **33 isolated node(s):** `name`, `private`, `type`, `test`, `test:watch` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `reduce()` connect `Deal Lifecycle & Testing` to `Core State Machine & Fuzzing`, `Trump & Trick Rules`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `legalActions()` connect `Core State Machine & Fuzzing` to `Deal Lifecycle & Testing`, `Trump & Trick Rules`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Rules Spec Sections` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `TypeScript Build Config` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `NPM Package & Tooling` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._