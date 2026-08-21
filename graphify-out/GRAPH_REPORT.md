# Graph Report - euchre  (2026-08-21)

## Corpus Check
- 49 files · ~45,666 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 435 nodes · 958 edges · 23 communities (21 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `707c025b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- _mix
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
- fullGame.test.tsx
- Art assets — spec
- Table.tsx
- generate_art.py
- main
- composite_sprite
- draw_card_frame
- light_from
- make_sprite_sheet
- make_cat_frames

## God Nodes (most connected - your core abstractions)
1. `make_face_card()` - 23 edges
2. `main()` - 23 edges
3. `reduce()` - 20 edges
4. `legalActions()` - 19 edges
5. `otherPlayer()` - 16 edges
6. `useGame()` - 15 edges
7. `Art assets — spec` - 15 edges
8. `Player` - 14 edges
9. `Card` - 13 edges
10. `PlayerView` - 13 edges

## Surprising Connections (you probably didn't know these)
- `playGame()` --calls--> `chooseMove()`  [EXTRACTED]
  scripts/balance.ts → shared/bot/heuristic.ts
- `useGame()` --calls--> `chooseMove()`  [EXTRACTED]
  src/game/useGame.ts → shared/bot/heuristic.ts
- `useGame()` --calls--> `trickWinnerIndex()`  [EXTRACTED]
  src/game/useGame.ts → shared/engine/rules.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `CompletedTrick` --references--> `TrickCard`  [EXTRACTED]
  src/game/useGame.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (23 total, 2 thin omitted)

### Community 0 - "_mix"
Cohesion: 0.12
Nodes (22): make_fireplace(), make_floorboards(), make_rug(), make_shelf(), make_snowfall(), make_table_felt(), make_wall_texture(), make_window_frame() (+14 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "types.ts"
Cohesion: 0.09
Nodes (58): aDealsFirst, bDealsFirst, PLAYERS, playGame(), run(), whoseTurn(), outcomes, pick() (+50 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (41): @fontsource/silkscreen, jsdom, dependencies, @fontsource/silkscreen, react, react-dom, vite-plugin-pwa, devDependencies (+33 more)

### Community 5 - "rules.ts"
Cohesion: 0.13
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

### Community 11 - "fullGame.test.tsx"
Cohesion: 0.25
Nodes (9): TRICK_HOLD_MS, advance(), lcg(), Outcome, playFullGame(), advance(), driveToHeldTrick(), driveToPlayPhase() (+1 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.11
Nodes (18): Animation convention, Art assets — spec, Audio (Phase 2c), Cards, Environment palette, Environment shading — `ramp()` (Phase 2d), Layout budget — asserted, not eyeballed, Lighting — `light_from()` (Phase 2d.5) (+10 more)

### Community 13 - "Table.tsx"
Cohesion: 0.07
Nodes (42): LonerTier, PlayerView, BOT, HUMAN, useLonerStamp(), Expression, useOpponentExpression(), useUpcardReveal() (+34 more)

### Community 15 - "generate_art.py"
Cohesion: 0.12
Nodes (24): _arm(), _assert_art_clear_of_indices(), _collar(), draw_face(), _ellipse(), _fringe(), _hand(), _head() (+16 more)

### Community 16 - "main"
Cohesion: 0.16
Nodes (29): _assert_pixel_grid(), body_color(), draw_glyph(), draw_old_timer_face(), draw_opponent_face(), main(), make_app_icon(), make_card_back() (+21 more)

### Community 17 - "composite_sprite"
Cohesion: 0.17
Nodes (13): composite_sprite(), darken(), _flame(), make_fire_frames(), make_seated_old_timer(), _mini_card_back(), One flame tongue as a polygon, with a slight lateral wobble. The width profile…, Animation frames for the hearth fire. Deterministic: each frame is a pure… (+5 more)

### Community 18 - "draw_card_frame"
Cohesion: 0.67
Nodes (3): draw_card_frame(), _score_card_frame(), ImageDraw

### Community 20 - "light_from"
Cohesion: 0.40
Nodes (5): _clamp(), light_from(), Move a colour toward white (amount > 0) or black (amount < 0), with a hue…, Relight a finished sprite directionally, as a post-process. **The measurement…, _shift()

### Community 22 - "make_cat_frames"
Cohesion: 0.50
Nodes (4): contact_shadow(), make_cat_frames(), A cat asleep by the fire, two frames of slow breathing. Two frames is enough…, A stepped dark ellipse to sit under an object so it reads as resting on a…

## Knowledge Gaps
- **93 isolated node(s):** `name`, `private`, `type`, `test`, `test:watch` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useGame()` connect `types.ts` to `useSfx.ts`, `Table.tsx`, `fullGame.test.tsx`, `rules.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Card` connect `types.ts` to `Table.tsx`, `rules.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `_mix` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09389671361502347 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._