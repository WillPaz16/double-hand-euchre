# Graph Report - euchre  (2026-08-20)

## Corpus Check
- 42 files · ~35,275 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 392 nodes · 822 edges · 19 communities (18 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `61d24c3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main
- RULES.md — Two-Handed Euchre Rules Spec
- reducer.ts
- compilerOptions
- devDependencies
- rules.ts
- generate_audio.py
- Hand A1 (Player A, selected/blind)
- Hand B1 (Player B, selected/blind)
- balance.ts
- CLAUDE.md
- types.ts
- Art assets — spec
- make_cat_frames
- generate_art.py
- Image
- make_seated_old_timer
- _shift

## God Nodes (most connected - your core abstractions)
1. `make_face_card()` - 23 edges
2. `main()` - 19 edges
3. `otherPlayer()` - 16 edges
4. `reduce()` - 16 edges
5. `legalActions()` - 14 edges
6. `Player` - 13 edges
7. `Art assets — spec` - 13 edges
8. `compilerOptions` - 13 edges
9. `Card` - 12 edges
10. `_mix()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `playRandomDeal()` --calls--> `legalActions()`  [EXTRACTED]
  scripts/fuzz.ts → shared/engine/legal.ts
- `playRandomDeal()` --calls--> `newGame()`  [EXTRACTED]
  scripts/fuzz.ts → shared/engine/reducer.ts
- `playRandomDeal()` --calls--> `reduce()`  [EXTRACTED]
  scripts/fuzz.ts → shared/engine/reducer.ts
- `makePlayState()` --calls--> `otherPlayer()`  [EXTRACTED]
  tests/helpers.ts → shared/engine/legal.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (19 total, 1 thin omitted)

### Community 0 - "main"
Cohesion: 0.14
Nodes (23): main(), make_fireplace(), make_floorboards(), make_shelf(), make_snowfall(), make_sprite_sheet(), make_table_felt(), make_wall_texture() (+15 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "reducer.ts"
Cohesion: 0.11
Nodes (45): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, DEFAULT_CONFIG, deal, fullDeck() (+37 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (37): jsdom, dependencies, react, react-dom, devDependencies, jsdom, @testing-library/dom, @testing-library/react (+29 more)

### Community 5 - "rules.ts"
Cohesion: 0.12
Nodes (28): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre, bestSuitByTrumpCount(), byType(), cardsEqual() (+20 more)

### Community 6 - "generate_audio.py"
Cohesion: 0.19
Nodes (19): _concat(), _envelope(), main(), make_card_play(), make_euchre_fanfare(), make_game_win_fanfare(), make_shuffle(), make_trick_win() (+11 more)

### Community 7 - "Hand A1 (Player A, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Hand B1 (Player B, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

### Community 9 - "balance.ts"
Cohesion: 0.32
Nodes (6): aDealsFirst, bDealsFirst, PLAYERS, playGame(), run(), whoseTurn()

### Community 11 - "types.ts"
Cohesion: 0.06
Nodes (54): Action, HandRole, LonerTier, Phase, PlayerView, App(), BOT, CompletedTrick (+46 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.12
Nodes (15): Animation convention, Art assets — spec, Audio (Phase 2c), Cards, Environment palette, Environment shading — `ramp()` (Phase 2d), Layout budget — asserted, not eyeballed, Lighting — `light_from()` (Phase 2d.5) (+7 more)

### Community 13 - "make_cat_frames"
Cohesion: 0.50
Nodes (4): contact_shadow(), make_cat_frames(), A cat asleep by the fire, two frames of slow breathing. Two frames is enough…, A stepped dark ellipse to sit under an object so it reads as resting on a…

### Community 15 - "generate_art.py"
Cohesion: 0.12
Nodes (22): _arm(), _assert_art_clear_of_indices(), _collar(), draw_face(), _ellipse(), _fringe(), _hand(), _head() (+14 more)

### Community 16 - "Image"
Cohesion: 0.20
Nodes (21): _assert_pixel_grid(), body_color(), draw_card_frame(), draw_glyph(), draw_old_timer_face(), make_card_back(), make_number_card(), make_old_timer_portrait() (+13 more)

### Community 17 - "make_seated_old_timer"
Cohesion: 0.17
Nodes (13): composite_sprite(), darken(), _flame(), make_fire_frames(), make_seated_old_timer(), _mini_card_back(), One flame tongue as a polygon, with a slight lateral wobble. The width profile…, Animation frames for the hearth fire. Deterministic: each frame is a pure… (+5 more)

### Community 19 - "_shift"
Cohesion: 0.40
Nodes (5): _clamp(), light_from(), Relight a finished sprite directionally, as a post-process. **The measurement…, Move a colour toward white (amount > 0) or black (amount < 0), with a hue…, _shift()

## Knowledge Gaps
- **84 isolated node(s):** `TERMINAL_PHASES`, `outcomes`, `SUITS`, `HandRole`, `Phase` (+79 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Player` connect `reducer.ts` to `balance.ts`, `types.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `TERMINAL_PHASES`, `outcomes`, `SUITS` to the rest of the system?**
  _84 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main` be split into smaller, more focused modules?**
  _Cohesion score 0.1383399209486166 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `reducer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11380471380471381 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._