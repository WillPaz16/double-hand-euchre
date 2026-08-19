# Graph Report - euchre  (2026-08-19)

## Corpus Check
- 38 files · ~21,108 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 326 nodes · 681 edges · 15 communities (14 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6a8c090e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate_art.py
- RULES.md — Two-Handed Euchre Rules Spec
- types.ts
- compilerOptions
- devDependencies
- heuristic.ts
- generate_audio.py
- Hand A1 (Player A, selected/blind)
- Hand B1 (Player B, selected/blind)
- deck.ts
- CLAUDE.md
- Game.tsx
- Art assets — spec
- Two-Handed Euchre

## God Nodes (most connected - your core abstractions)
1. `make_face_card()` - 21 edges
2. `otherPlayer()` - 16 edges
3. `reduce()` - 16 edges
4. `legalActions()` - 14 edges
5. `compilerOptions` - 13 edges
6. `Player` - 12 edges
7. `Card` - 12 edges
8. `PlayerView` - 10 edges
9. `chooseMove()` - 10 edges
10. `Art assets — spec` - 10 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `Player`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `useGame()` --calls--> `chooseMove()`  [EXTRACTED]
  src/game/useGame.ts → shared/bot/heuristic.ts
- `PlayStateOptions` --references--> `Config`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Suit`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (15 total, 1 thin omitted)

### Community 0 - "generate_art.py"
Cohesion: 0.06
Nodes (60): _arm(), _assert_art_clear_of_indices(), body_color(), _clamp(), _collar(), composite_sprite(), contact_shadow(), darken() (+52 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "types.ts"
Cohesion: 0.10
Nodes (52): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, DEFAULT_CONFIG, actingHand(), handCards() (+44 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (30): dependencies, react, react-dom, devDependencies, tsx, @types/react, @types/react-dom, typescript (+22 more)

### Community 5 - "heuristic.ts"
Cohesion: 0.29
Nodes (12): bestSuitByTrumpCount(), byType(), cardsEqual(), chooseMove(), countTrump(), findCardAction(), highest(), lowest() (+4 more)

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
Cohesion: 0.42
Nodes (7): deal, fullDeck(), RANKS, seededRng(), shuffledDeck(), SUITS, PlayerHands

### Community 11 - "Game.tsx"
Cohesion: 0.08
Nodes (35): Player, PlayerView, App(), BOT, freshSeed(), HUMAN, useGame(), Expression (+27 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.18
Nodes (10): Art assets — spec, Audio (Phase 2c), Cards, Layout budget — asserted, not eyeballed, Old-Timer portrait, Output, Palette — cabin by the fire, Regenerating (+2 more)

### Community 13 - "Two-Handed Euchre"
Cohesion: 0.33
Nodes (5): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre

## Knowledge Gaps
- **70 isolated node(s):** `Expression`, `SoundName`, `HandRole`, `Phase`, `graphify` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card` connect `types.ts` to `deck.ts`, `Game.tsx`, `heuristic.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Player` connect `Game.tsx` to `deck.ts`, `types.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `Expression`, `SoundName`, `HandRole` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate_art.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06331976481230213 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0992063492063492 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._