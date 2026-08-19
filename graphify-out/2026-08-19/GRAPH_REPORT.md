# Graph Report - euchre  (2026-08-19)

## Corpus Check
- 38 files · ~26,582 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 350 nodes · 737 edges · 20 communities (19 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `09d43800`
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
- deck.ts
- CLAUDE.md
- types.ts
- Art assets — spec
- Two-Handed Euchre
- generate_art.py
- make_scoreboard_card
- composite_sprite
- Image
- _assert_art_clear_of_indices

## God Nodes (most connected - your core abstractions)
1. `make_face_card()` - 21 edges
2. `main()` - 18 edges
3. `otherPlayer()` - 16 edges
4. `reduce()` - 16 edges
5. `legalActions()` - 14 edges
6. `Art assets — spec` - 13 edges
7. `compilerOptions` - 13 edges
8. `Player` - 12 edges
9. `Card` - 12 edges
10. `_poly()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `PlayStateOptions` --references--> `Config`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `Card`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `useGame()` --calls--> `chooseMove()`  [EXTRACTED]
  src/game/useGame.ts → shared/bot/heuristic.ts
- `PlayStateOptions` --references--> `Player`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts
- `PlayStateOptions` --references--> `LonerTier`  [EXTRACTED]
  tests/helpers.ts → shared/engine/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loner Declaration Tier System** — rules_loner_declaration_windows, rules_full_blind_loner, rules_blind_trump_loner, rules_standard_loner [EXTRACTED 1.00]
- **Fixed Trick Rotation Ring (Four Hands)** — rules_trick_rotation_ring, rules_hand_a1, rules_hand_b1, rules_hand_a2, rules_hand_b2 [EXTRACTED 1.00]
- **Config-Only V1 Defaults** — rules_stick_the_dealer, rules_sequential_first_refusal, rules_blind_hand_reveal, rules_dealer_alternation, rules_misdeal_conditions, rules_config_ts [INFERRED 0.85]

## Communities (20 total, 1 thin omitted)

### Community 0 - "main"
Cohesion: 0.11
Nodes (27): _clamp(), main(), make_card_back(), make_fireplace(), make_floorboards(), make_shelf(), make_snowfall(), make_sprite_sheet() (+19 more)

### Community 1 - "RULES.md — Two-Handed Euchre Rules Spec"
Cohesion: 0.12
Nodes (24): §3 Bidding (standard, on/after the upcard), Blind Hand Reveal Default, Blind-Trump Loner (6 points), config.ts Game-to-10 Constant, Dealer Alternation Default, Deferred Variant Rules ('few crazy rules'), RULES.md — Two-Handed Euchre Rules Spec, Full-Blind Loner (8 points) (+16 more)

### Community 2 - "reducer.ts"
Cohesion: 0.15
Nodes (34): outcomes, pick(), playRandomDeal(), seededRng(), TERMINAL_PHASES, DEFAULT_CONFIG, actingHand(), handCards() (+26 more)

### Community 3 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, scripts, shared, src, tests, compilerOptions (+13 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (30): dependencies, react, react-dom, devDependencies, tsx, @types/react, @types/react-dom, typescript (+22 more)

### Community 5 - "rules.ts"
Cohesion: 0.18
Nodes (23): bestSuitByTrumpCount(), byType(), cardsEqual(), chooseMove(), countTrump(), findCardAction(), highest(), lowest() (+15 more)

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
Cohesion: 0.08
Nodes (41): Action, HandRole, LonerTier, Phase, Player, PlayerView, Suit, App() (+33 more)

### Community 12 - "Art assets — spec"
Cohesion: 0.14
Nodes (13): Animation convention, Art assets — spec, Audio (Phase 2c), Cards, Environment palette, Environment shading — `ramp()` (Phase 2d), Layout budget — asserted, not eyeballed, Living things (Phase 2d.3) (+5 more)

### Community 13 - "Two-Handed Euchre"
Cohesion: 0.33
Nodes (5): Knowledge graph, Repo layout, Running the engine, Status, Two-Handed Euchre

### Community 15 - "generate_art.py"
Cohesion: 0.14
Nodes (18): _arm(), _collar(), contact_shadow(), _ellipse(), _fringe(), _hand(), _head(), _hem_trim() (+10 more)

### Community 16 - "make_scoreboard_card"
Cohesion: 0.27
Nodes (12): body_color(), draw_card_frame(), draw_glyph(), make_number_card(), make_scoreboard_card(), paste_corners(), pip_sprite(), For the un-outlined corner rank glyph — wants maximum contrast against… (+4 more)

### Community 17 - "composite_sprite"
Cohesion: 0.20
Nodes (11): composite_sprite(), darken(), _flame(), make_fire_frames(), make_seated_old_timer(), The opponent, seated in the room — same character as the scoreboard portrait…, `parts` is a list of (draw_fn, color) painted in order — later parts cover…, One derived shadow tone per material — keeps the palette from exploding while… (+3 more)

### Community 18 - "Image"
Cohesion: 0.28
Nodes (9): draw_face(), draw_old_timer_face(), make_cat_frames(), make_old_timer_portrait(), paste(), A cat asleep by the fire, two frames of slow breathing. Two frames is enough…, Big round eyes with a sparkle, brows, blush. Drawn after the silhouette outline…, `expression`: "idle" (neutral), "happy" (won a trick/euchre), "rueful" (lost… (+1 more)

### Community 19 - "_assert_art_clear_of_indices"
Cohesion: 0.50
Nodes (4): _assert_art_clear_of_indices(), _index_boxes(), The two rectangles paste_corners() reserves — kept in sync with it by deriving…, Guardrail: centred artwork must never intrude into a reserved corner index box.…

## Knowledge Gaps
- **73 isolated node(s):** `Palette — cabin by the fire`, `Cards`, `Layout budget — asserted, not eyeballed`, `Environment shading — `ramp()` (Phase 2d)`, `Environment palette` (+68 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card` connect `rules.ts` to `deck.ts`, `reducer.ts`, `types.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `Player` connect `types.ts` to `deck.ts`, `reducer.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `Palette — cabin by the fire`, `Cards`, `Layout budget — asserted, not eyeballed` to the rest of the system?**
  _73 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `RULES.md — Two-Handed Euchre Rules Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.11956521739130435 - nodes in this community are weakly interconnected._
- **Should `reducer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.148664343786295 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._