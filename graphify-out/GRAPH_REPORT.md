# Graph Report - euchre  (2026-08-19)

## Corpus Check
- 38 files · ~27,678 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 354 nodes · 744 edges · 19 communities (18 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cdc12091`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main
- RULES.md — Two-Handed Euchre Rules Spec
- types.ts
- compilerOptions
- devDependencies
- rules.ts
- generate_audio.py
- Hand A1 (Player A, selected/blind)
- Hand B1 (Player B, selected/blind)
- CLAUDE.md
- useGame.ts
- Art assets — spec
- Two-Handed Euchre
- make_face_card
- Image
- make_seated_old_timer
- make_cat_frames
- generate_art.py

## God Nodes (most connected - your core abstractions)
1. `make_face_card()` - 21 edges
2. `main()` - 18 edges
3. `otherPlayer()` - 16 edges
4. `reduce()` - 16 edges
5. `legalActions()` - 14 edges
6. `Art assets — spec` - 13 edges
7. `compilerOptions` - 13 edges
8. `Card` - 12 edges
9. `Player` - 12 edges
10. `ramp()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `Card`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Config`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Player`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Suit`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (19 total, 1 thin omitted)

### Community 0 - "main"
Cohesion: 0.14
Nodes (22): main(), make_card_back(), make_fireplace(), make_floorboards(), make_shelf(), make_snowfall(), make_table_felt(), make_wall_texture() (+14 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "types.ts"
Cohesion: 0.11
Nodes (49): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, DEFAULT_CONFIG, deal, fullDeck() (+41 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (30): dependencies, react, react-dom, devDependencies, tsx, @types/react, @types/react-dom, typescript (+22 more)

### Community 5 - "rules.ts"
Cohesion: 0.18
Nodes (22): bestSuitByTrumpCount(), byType(), cardsEqual(), chooseMove(), countTrump(), findCardAction(), highest(), lowest() (+14 more)

### Community 6 - "generate_audio.py"
Cohesion: 0.19
Nodes (19): _concat(), _envelope(), main(), make_card_play(), make_euchre_fanfare(), make_game_win_fanfare(), make_shuffle(), make_trick_win() (+11 more)

### Community 7 - "Hand A1 (Player A, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Hand B1 (Player B, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

### Community 11 - "useGame.ts"
Cohesion: 0.08
Nodes (37): Action, PlayerView, App(), BOT, CompletedTrick, freshSeed(), HUMAN, TRICK_HOLD_MS (+29 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.14
Nodes (13): Animation convention, Art assets — spec, Audio (Phase 2c), Cards, Environment palette, Environment shading — `ramp()` (Phase 2d), Layout budget — asserted, not eyeballed, Living things (Phase 2d.3) (+5 more)

### Community 13 - "Two-Handed Euchre"
Cohesion: 0.33
Nodes (5): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre

### Community 15 - "make_face_card"
Cohesion: 0.16
Nodes (18): _arm(), _collar(), draw_face(), _ellipse(), _fringe(), _hand(), _head(), _hem_trim() (+10 more)

### Community 16 - "Image"
Cohesion: 0.21
Nodes (17): body_color(), draw_card_frame(), draw_glyph(), draw_old_timer_face(), make_number_card(), make_old_timer_portrait(), make_scoreboard_card(), paste() (+9 more)

### Community 17 - "make_seated_old_timer"
Cohesion: 0.17
Nodes (13): composite_sprite(), darken(), _flame(), make_fire_frames(), make_seated_old_timer(), _mini_card_back(), A small card back for the seated figure's hand. Uses the real card-back palette…, The opponent, seated in the room — same character as the scoreboard portrait… (+5 more)

### Community 18 - "make_cat_frames"
Cohesion: 0.50
Nodes (4): contact_shadow(), make_cat_frames(), A cat asleep by the fire, two frames of slow breathing. Two frames is enough…, A stepped dark ellipse to sit under an object so it reads as resting on a…

### Community 19 - "generate_art.py"
Cohesion: 0.14
Nodes (9): _assert_art_clear_of_indices(), _clamp(), _index_boxes(), make_sprite_sheet(), Paste equal-sized frames into one horizontal strip for CSS steps() animation.…, The two rectangles paste_corners() reserves — kept in sync with it by deriving…, Guardrail: centred artwork must never intrude into a reserved corner index box.…, Move a colour toward white (amount > 0) or black (amount < 0), with a hue… (+1 more)

## Knowledge Gaps
- **74 isolated node(s):** `TRICK_HOLD_MS`, `SEATS`, `Expression`, `SoundName`, `HandRole` (+69 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card` connect `types.ts` to `useGame.ts`, `rules.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `PlayerView` connect `useGame.ts` to `types.ts`, `rules.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `TRICK_HOLD_MS`, `SEATS`, `Expression` to the rest of the system?**
  _74 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10790960451977401 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._