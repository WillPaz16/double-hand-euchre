# The rules of Double-Hand Euchre

The complete rules of the variant, and the reference the game engine is built from: tests in
[`tests/`](tests) cite these sections by number, and any rule argument is settled here. If you just want
to play, [the game](https://doublehand.willpaz16.workers.dev) teaches itself; come back when you
want the fine print.

**If you already know euchre**, three things are different and everything else is standard:

1. **You play two hands.** Four hands are dealt, two to each player. Every trick has four cards,
   two of them yours. It is four-handed euchre with each player holding both seats of a
   partnership.
2. **You pick one hand blind.** Before anyone looks, you choose one of your two face-down hands to
   pick up. The other stays down, and you see it only when it is that hand's turn to play, so you
   are holding one hand and remembering the other.
3. **Going alone has three tiers.** The usual way scores 4. Committing before you look at your hand
   scores 6, and committing before trump is even known scores 8.

**Words this document uses**

| Term | Meaning |
|---|---|
| hand | One of the four five-card piles dealt. Each player owns two. The game labels yours "Hand 1" and "Hand 2". |
| selected hand | The one you chose, blind, and picked up. |
| blind hand | Your other one. It plays every trick; you see it only on its own turn. |
| upcard | The card turned face up from the kitty, offered as trump in round 1. |
| maker | Whoever named trump. |
| loner | Playing a hand alone, with your other hand set aside for the deal. |
| euchred | The makers failed to take 3 tricks, so the other side scores. |

Standard euchre terms (bowers, ordering up, marches) carry their usual meanings.

## 1. Setup

- Standard 24-card euchre deck (9, 10, J, Q, K, A in four suits).
- Two players, **A** and **B**. Each player controls two hands, seated alternately:
  `A1, B1, A2, B2`. `{A1, A2}` are partners; `{B1, B2}` are partners. Structurally this is
  4-handed euchre with one player controlling both seats of each "partnership."
- Dealer deals 4 face-down hands of 5 cards, one in front of each seat. A 4-card kitty
  remains; the top card of the kitty is turned face-up (the **upcard**).
- **Blind selection**: before looking at any cards, each player chooses one of their two
  face-down hands to be their *selected* hand. The other becomes their *blind* hand. Selection order:
  non-dealer, then dealer. Neither player has seen any cards at this point.

## 2. Loner declaration windows

Going alone can be called with three different amounts of information. Each tier has its own
window in the sequence, and once a window passes it cannot be revisited.

1. **Full-blind loner window** — immediately after blind selection, before either player has
   looked at their selected hand or the upcard is turned. A player may declare a full-blind
   loner here: alone, zero information about anything. **8 points** on a win.
2. Upcard is turned face-up — visible to both players, still nobody has looked at their own
   hand.
3. **Blind-hand loner window** — trump is now known (the upcard's suit), but neither player
   has looked at their own selected hand. A player may declare a blind-hand loner here: alone,
   trump known, hand unseen. Trump is fixed to the upcard's suit: this tier accepts the upcard's
   suit, it does not name one. **6 points** on a win.
4. Both players now look at their selected hand. Normal bidding begins (§3), during which a
   standard loner may be called. **4 points** on a win.

**Why this order.** An earlier draft had these two windows the other way around (hand seen, trump
blind), which is backwards: naming trump blind is a real decision, while committing to
alone-with-a-fixed-trump before seeing your cards is closer to the full-blind gamble with the
trump suit handed to you. The point values (6 sitting between 4 and 8) only make sense this way.

Declaration order within each window: non-dealer, then dealer. If either player declares in
a window, bidding ends there and play proceeds to §5 with that player as the lone maker. If
neither declares, proceed to the next window/round.

**Default (v1)**: sequential first-refusal within each window — non-dealer decides first;
if they pass, dealer gets the same window before it closes. Matches every other bidding
round in the game (§3), so it's the same `legalActions` shape reused four times, not a
special case.

## 3. Bidding (standard, on/after the upcard)

Only reached if nobody declared a full-blind or blind-hand loner.

- **Round 1**: non-dealer, then dealer, may order up the upcard's suit as trump (optionally
  declaring a standard loner, 4 points). Ordering up: dealer takes the upcard into their
  **selected** hand and discards one card from that same hand (6 cards momentarily, discard
  back to 5). The blind hand is never touched by the discard.
- If both pass round 1, the upcard is turned down.
- **Round 2**: non-dealer, then dealer, may name any suit except the turned-down suit as
  trump (optionally declaring a standard loner). No card exchange in round 2 — trump is just
  named.
- **Stick the dealer** (config flag, default **on**): if both players pass round 2, the
  dealer is forced to name a trump suit (any suit except the turned-down one) rather than a
  misdeal/redeal.
- **Default (v1)**: if stick-the-dealer is off and both pass round 2, the deal is thrown in
  and redealt by the same dealer. Config-only; flip the flag, no engine change.

A standard loner may be called by either player at the moment they name/order trump in
rounds 1 or 2, from their **selected** hand only (never the blind hand — they haven't seen
it). This is the *only* way to call a standard loner — there is no separate "go alone" action
independent of naming trump.

## 4. Tiers 2 & 3 dealer exchange

If the maker declared blind-hand or full-blind (tiers 2/3), the dealer still receives the
upcard and discards, **regardless of who is the maker or whether the dealer is even
involved in the bid** — this happens whether the dealer made the call or not:

- Dealer takes the upcard into their **selected** hand, discards one card back to 5.
- This happens even if the dealer is the opponent, not the maker — it's a mechanical
  consequence of the upcard existing, not a bidding action.

**Default (v1)**: private, consistent with every other hand-content rule in this game —
nothing is face-up except the upcard itself and the final trick-by-trick play.

## 5. Going alone — mechanics

The lone player sets one of their two hands **face-down and out of play entirely** for the
deal (their partner-hand does not participate at all — neither leading, following, nor being
dealt into later tricks). Which hand is set aside:

- Standard/blind-hand loner: the player has a selected hand; the **other** (unselected) hand
  is set aside. Player plays all 5 tricks from their selected hand alone, against both of the
  opponent's hands.
- Full-blind loner: **resolved by sequencing, not actually ambiguous** — blind selection
  (§1) happens for both players before any loner window opens (§2), so a full-blind
  declaration is always made with a selected hand already fixed. That selected hand is the
  lone hand; the player has simply never looked at it. No separate rule needed.

While the lone player plays solo, their partner-hand's seat is skipped entirely in the trick
rotation — the trick becomes 3 cards (lone player + opponent's two hands), not 4.

## 6. Play

**Resolved.** Both of a player's hands play in every trick — 4 cards per trick, one from
each of the four hands (A1, B1, A2, B2), which is why 5 tricks × 4 cards exactly exhausts
the 20 dealt cards. There is no "sitting out" for a trick except the full loner case (§5),
where a hand is removed from the deal entirely.

Play order is a fixed ring for the whole deal, walked starting from whoever leads:

```
non-dealer's selected hand → dealer's selected hand →
non-dealer's blind hand → dealer's blind hand → (back to non-dealer's selected)
```

This ring is set once at the start of the deal (it depends on selected/blind status, not on
dealer role, and neither changes mid-deal) and never changes. What changes trick to trick is
only the **starting point**:

- Trick 1 starts at non-dealer's selected hand (standard "eldest hand leads").
- Every subsequent trick starts at whichever specific hand won the previous trick, then
  proceeds around the same fixed ring from there.

This is exactly standard euchre trick-leading — "winner leads next" — applied at the
hand level instead of the player level. No extra state is needed: if a hand keeps winning,
it keeps leading (falls out naturally); the lead only passes to a player's other hand when
that other hand itself wins a trick. Nothing about a player "choosing" which hand acts —
the ring plus the last winner fully determines it.

- Standard euchre follow-suit rules apply per card played; left bower is trump.
- **Visibility**: only the hand currently taking its turn is shown to its owner. Since both
  of a player's hands act within the same trick (at their respective ring positions), a
  player flips between their two hands' views potentially twice within one trick — once at
  each hand's turn — never seeing both simultaneously.
- Loner case: the set-aside hand's ring position is simply skipped for the whole deal,
  making the ring 3 long instead of 4.

## 7. Scoring

Standard euchre point values:
- Makers take 3–4 of 5 tricks: **1 point**.
- Makers take all 5 (a "march" or sweep): **2 points**.
- Makers fail to take 3 (**euchred**): defenders get **2 points**.
- Loner sweeps all 5 alone: **4 / 6 / 8 points** per tier (§2), instead of the standard 2.
  **Default (v1)**: a loner who takes 3–4 tricks (doesn't sweep) scores the standard
  **1 point** — the tiered bonus applies only to a clean sweep. A loner who fails to take 3
  is euchred exactly as normal: defenders get **2 points**, regardless of tier.
- Game to **10 points** (default; a `config.ts` constant, changeable with no logic change).

## 8. Defaults, and room left for variants

Settled as defaults. Each is a config value, so changing one costs no engine work:
- [x] Misdeal conditions: **none in v1** — the blind mechanic has no exposed-card-during-deal
      case, so there's nothing to misdeal on. Revisit only if a real deal produces a dispute.
- [x] Blind hand reveal: **revealed to both players at the end of each deal**, purely for
      table transparency/curiosity. Cosmetic — a UI flag, not an engine rule.
- [x] Dealer alternates every deal: **standard**, clockwise from the previous dealer.

House variants can be layered on later as extra config or extra action types, without changing
anything above.

---

**Status**: implemented. Every rule here is live in
[`shared/engine/`](shared/engine) and exercised by the test suite plus a 10,000-deal fuzz run. The
two blind-loner tiers ship **off** by default — they are this variant's own addition to euchre, so
you opt into them in Settings (or mid-game, from the next hand).
