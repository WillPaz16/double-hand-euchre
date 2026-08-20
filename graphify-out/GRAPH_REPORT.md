# Graph Report - euchre  (2026-08-20)

## Corpus Check
- 48 files · ~41,190 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 418 nodes · 919 edges · 18 communities (17 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8eeb42de`
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
- useSfx.ts
- CLAUDE.md
- useGame.ts
- Art assets — spec
- fullGame.test.tsx
- generate_art.py
- Image
- make_seated_old_timer

## God Nodes (most connected - your core abstractions)
1. `make_face_card()` - 23 edges
2. `main()` - 21 edges
3. `reduce()` - 20 edges
4. `legalActions()` - 19 edges
5. `otherPlayer()` - 16 edges
6. `useGame()` - 15 edges
7. `Player` - 14 edges
8. `Card` - 13 edges
9. `PlayerView` - 13 edges
10. `compilerOptions` - 13 edges

## Surprising Connections (you probably didn't know these)
- `playGame()` --calls--> `chooseMove()`  [EXTRACTED]
  scripts/balance.ts → shared/bot/heuristic.ts
- `useGame()` --calls--> `chooseMove()`  [EXTRACTED]
  src/game/useGame.ts → shared/bot/heuristic.ts
- `useGame()` --calls--> `trickWinnerIndex()`  [EXTRACTED]
  src/game/useGame.ts → shared/engine/rules.ts
- `CompletedTrick` --references--> `Player`  [EXTRACTED]
  src/game/useGame.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (18 total, 1 thin omitted)

### Community 0 - "main"
Cohesion: 0.11
Nodes (28): _clamp(), light_from(), main(), make_fireplace(), make_floorboards(), make_shelf(), make_snowfall(), make_sprite_sheet() (+20 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "types.ts"
Cohesion: 0.09
Nodes (57): aDealsFirst, bDealsFirst, PLAYERS, playGame(), run(), whoseTurn(), outcomes, pick() (+49 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (41): @fontsource/silkscreen, jsdom, dependencies, @fontsource/silkscreen, react, react-dom, vite-plugin-pwa, devDependencies (+33 more)

### Community 5 - "rules.ts"
Cohesion: 0.12
Nodes (27): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre, bestSuitByTrumpCount(), byType(), cardsEqual() (+19 more)

### Community 6 - "generate_audio.py"
Cohesion: 0.19
Nodes (19): _concat(), _envelope(), main(), make_card_play(), make_euchre_fanfare(), make_game_win_fanfare(), make_shuffle(), make_trick_win() (+11 more)

### Community 7 - "Hand A1 (Player A, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand A1 (Player A, selected/blind), Hand A2 (Player A, selected/blind), Player A

### Community 8 - "Hand B1 (Player B, selected/blind)"
Cohesion: 1.00
Nodes (3): Hand B1 (Player B, selected/blind), Hand B2 (Player B, selected/blind), Player B

### Community 9 - "useSfx.ts"
Cohesion: 0.19
Nodes (12): App(), isMuted(), setMuted(), play(), SOUND_FILES, SoundName, useSfx(), useSoundBank() (+4 more)

### Community 11 - "useGame.ts"
Cohesion: 0.07
Nodes (40): LonerTier, PlayerView, BOT, CompletedTrick, HUMAN, useLonerStamp(), Expression, useOpponentExpression() (+32 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.12
Nodes (15): Animation convention, Art assets — spec, Audio (Phase 2c), Cards, Environment palette, Environment shading — `ramp()` (Phase 2d), Layout budget — asserted, not eyeballed, Lighting — `light_from()` (Phase 2d.5) (+7 more)

### Community 13 - "fullGame.test.tsx"
Cohesion: 0.25
Nodes (9): TRICK_HOLD_MS, advance(), lcg(), Outcome, playFullGame(), advance(), driveToHeldTrick(), driveToPlayPhase() (+1 more)

### Community 15 - "generate_art.py"
Cohesion: 0.12
Nodes (22): _arm(), _assert_art_clear_of_indices(), _collar(), draw_face(), _ellipse(), _fringe(), _hand(), _head() (+14 more)

### Community 16 - "Image"
Cohesion: 0.17
Nodes (25): _assert_pixel_grid(), body_color(), draw_card_frame(), draw_glyph(), draw_old_timer_face(), make_app_icon(), make_card_back(), make_number_card() (+17 more)

### Community 17 - "make_seated_old_timer"
Cohesion: 0.12
Nodes (17): composite_sprite(), contact_shadow(), darken(), _flame(), make_cat_frames(), make_fire_frames(), make_seated_old_timer(), _mini_card_back() (+9 more)

## Knowledge Gaps
- **90 isolated node(s):** `name`, `private`, `type`, `test`, `test:watch` (+85 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useGame()` connect `types.ts` to `useSfx.ts`, `fullGame.test.tsx`, `useGame.ts`, `rules.ts`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Card` connect `types.ts` to `useGame.ts`, `rules.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _90 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09462915601023018 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._