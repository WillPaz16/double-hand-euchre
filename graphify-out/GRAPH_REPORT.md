# Graph Report - euchre  (2026-08-19)

## Corpus Check
- 38 files · ~24,893 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 343 nodes · 716 edges · 15 communities (14 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8993cb6a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate_art.py
- RULES.md — Two-Handed Euchre Rules Spec
- reducer.ts
- compilerOptions
- devDependencies
- rules.ts
- generate_audio.py
- Hand A1 (Player A, selected/blind)
- Hand B1 (Player B, selected/blind)
- deck.ts
- CLAUDE.md
- types.ts
- Art assets — spec
- Two-Handed Euchre

## God Nodes (most connected - your core abstractions)
1. `make_face_card()` - 21 edges
2. `otherPlayer()` - 16 edges
3. `reduce()` - 16 edges
4. `main()` - 15 edges
5. `legalActions()` - 14 edges
6. `compilerOptions` - 13 edges
7. `Art assets — spec` - 12 edges
8. `Card` - 12 edges
9. `Player` - 12 edges
10. `PlayerView` - 10 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `Player`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Config`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `useGame()` --calls--> `chooseMove()`  [EXTRACTED]
  src/game/useGame.ts → shared/bot/heuristic.ts
- `PlayStateOptions` --references--> `Card`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (15 total, 1 thin omitted)

### Community 0 - "generate_art.py"
Cohesion: 0.05
Nodes (75): _arm(), _assert_art_clear_of_indices(), body_color(), _clamp(), _collar(), composite_sprite(), contact_shadow(), darken() (+67 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "reducer.ts"
Cohesion: 0.18
Nodes (28): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, DEFAULT_CONFIG, actingHand(), legalActions() (+20 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (30): dependencies, react, react-dom, devDependencies, tsx, @types/react, @types/react-dom, typescript (+22 more)

### Community 5 - "rules.ts"
Cohesion: 0.15
Nodes (26): bestSuitByTrumpCount(), byType(), cardsEqual(), chooseMove(), countTrump(), findCardAction(), highest(), lowest() (+18 more)

### Community 6 - "generate_audio.py"
Cohesion: 0.19
Nodes (19): _concat(), _envelope(), main(), make_card_play(), make_euchre_fanfare(), make_game_win_fanfare(), make_shuffle(), make_trick_win() (+11 more)

### Community 7 - "Hand A1 (Player A, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Hand B1 (Player B, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

### Community 9 - "deck.ts"
Cohesion: 0.36
Nodes (8): deal, fullDeck(), RANKS, seededRng(), shuffledDeck(), SUITS, PlayerHands, Rank

### Community 11 - "types.ts"
Cohesion: 0.07
Nodes (44): handCards(), Action, GameState, HandId, HandRole, Phase, Player, PlayerView (+36 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.15
Nodes (12): Animation convention, Art assets — spec, Audio (Phase 2c), Cards, Environment palette, Environment shading — `ramp()` (Phase 2d), Layout budget — asserted, not eyeballed, Output (+4 more)

### Community 13 - "Two-Handed Euchre"
Cohesion: 0.33
Nodes (5): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre

## Knowledge Gaps
- **72 isolated node(s):** `Palette — cabin by the fire`, `Cards`, `Layout budget — asserted, not eyeballed`, `Environment shading — `ramp()` (Phase 2d)`, `Environment palette` (+67 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card` connect `rules.ts` to `deck.ts`, `reducer.ts`, `types.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `Player` connect `types.ts` to `deck.ts`, `reducer.ts`, `rules.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `Palette — cabin by the fire`, `Cards`, `Layout budget — asserted, not eyeballed` to the rest of the system?**
  _72 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate_art.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05209274314965372 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._