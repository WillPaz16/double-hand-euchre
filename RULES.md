# Two-Handed Euchre — Rules Spec

Canonical source of truth for the game engine. Every engine test in Phase 1 traces back to
a line in this document. Sections marked **OPEN** are unresolved and block Phase 1 until
closed.

## 1. Setup

- Standard 24-card euchre deck (9, 10, J, Q, K, A in four suits).
- Two players, **A** and **B**. Each player controls two hands, seated alternately:
  `A1, B1, A2, B2`. `{A1, A2}` are partners; `{B1, B2}` are partners. Structurally this is
  4-handed euchre with one player controlling both seats of each "partnership."
- Dealer deals 4 packets of 5 cards face-down, one in front of each seat. A 4-card kitty
  remains; the top card of the kitty is turned face-up (the **upcard**).
- **Blind selection**: before looking at any cards, each player chooses one of their two
  packets to be their *selected* hand. The other becomes their *blind* hand. Selection order:
  non-dealer, then dealer. Neither player has seen any cards at this point.

## 2. Loner declaration windows

Going alone can be called with three different amounts of information. Each tier has its own
window in the sequence, and once a window passes it cannot be revisited.

1. **Full-blind loner window** — immediately after blind selection, before either player has
   looked at their selected hand. A player may declare a full-blind loner here: alone, zero
   information about their hand or the upcard. **8 points** on a win.
2. Both players now look at their selected hand (not the blind hand).
3. **Blind-trump loner window** — after seeing the selected hand but before the upcard is
   turned face-up. A player may declare a blind-trump loner: alone, hand known, trump unknown
   — they name a trump suit blind. **6 points** on a win.
4. Upcard is turned face-up. Normal bidding begins (§3), during which a standard loner may be
   called. **4 points** on a win.

Declaration order within each window: non-dealer, then dealer. If either player declares in
a window, bidding ends there and play proceeds to §5 with that player as the lone maker. If
neither declares, proceed to the next window/round.

**OPEN**: Can only *one* player declare in the full-blind or blind-trump windows (first to
declare wins it, like an auction), or does non-dealer get first refusal specifically, with
dealer only acting if non-dealer passes on *that* window? Assumed: sequential first-refusal,
non-dealer then dealer, matching every other bidding round in the game.

## 3. Bidding (standard, on/after the upcard)

Only reached if nobody declared a full-blind or blind-trump loner.

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
- If stick-the-dealer is off and both pass round 2: **OPEN** — redeal, or something else?

A standard loner may be called by either player at the moment they name/order trump in
rounds 1 or 2, from their **selected** hand only (never the blind hand — they haven't seen
it).

## 4. Tiers 2 & 3 dealer exchange

If the maker declared blind-trump or full-blind (tiers 2/3), the dealer still receives the
upcard and discards, **regardless of who is the maker or whether the dealer is even
involved in the bid** — this happens whether the dealer made the call or not:

- Dealer takes the upcard into their **selected** hand, discards one card back to 5.
- This happens even if the dealer is the opponent, not the maker — it's a mechanical
  consequence of the upcard existing, not a bidding action.

**OPEN**: Does this exchange happen face-up (both players see it) or does the dealer do it
privately? Assumed private, since hands are otherwise private, but flag for confirmation.

## 5. Going alone — mechanics

The lone player sets one of their two hands **face-down and out of play entirely** for the
deal (their partner-hand does not participate at all — neither leading, following, nor being
dealt into later tricks). Which hand is set aside:

- Standard/blind-trump loner: the player has a selected hand; the **other** (unselected) hand
  is set aside. Player plays all 5 tricks from their selected hand alone, against both of the
  opponent's hands.
- Full-blind loner: player has not even looked at either hand yet. **OPEN**: which of their
  two hands becomes the lone hand — is it still "the selected one" from blind pick (§1), or
  does going full-blind bypass selection entirely and they pick one hand at the moment of
  declaring? Assumed: the blind selection from §1 already happened before this window, so the
  same selected hand is used; the player simply never got to look at it before committing.

While the lone player plays solo, their partner-hand's seat is skipped entirely in the trick
rotation — the trick becomes 3 cards (lone player + opponent's two hands), not 4.

## 6. Play

- Non-dealer's **selected** hand leads the first trick.
- Trick order is seat order — `A1, B1, A2, B2` — skipping any hand set aside for a loner.
- Standard euchre follow-suit rules; left bower is trump.
- **The hand that plays the winning card leads the next trick.** The *other* hand belonging
  to that same player does not automatically get a turn — it is simply that specific hand's
  turn to lead whenever its owner is next in rotation and it was the one that won.

  Concretely: if A1 wins the trick, A1 leads next; B (whichever of B1/B2 is up next in
  rotation) follows; then it's A's turn again but they play from **whichever of A1/A2 seat
  order dictates next**, not necessarily the hand that just won. **OPEN — this is the one
  rule I most need you to double check**: is trick rotation still strict alternating seat
  order (A1, B1, A2, B2, A1, ...) with the only variable being *which specific hand* leads
  when it's "A's turn," or does winning a trick actually change the seat *rotation itself* so
  the winning hand's owner effectively skips to acting again out of the normal order?

  Working assumption for the engine (please confirm or correct): rotation order for who acts
  next is always determined by "whoever is next after the last card played," normal
  trick-taking order, and "the winner leads" just means the winning **hand** (not just the
  winning **player**) is the specific one of that player's two hands that takes the lead
  slot. The player's *other* hand only gets to act when normal rotation brings that player
  around again, at which point they choose... **OPEN**: do they choose which of their two
  hands to play at that point, or is it forced to be "the hand that did NOT just win,"
  i.e. you alternate your own two hands strictly?

- **Visibility**: only the hand currently taking its turn is shown to its owner. The
  moment a different hand (including the same player's other hand) needs to act, the
  previous hand flips face-down again. A player never sees both of their own hands
  simultaneously.

## 7. Scoring

Standard euchre point values:
- Makers take 3–4 of 5 tricks: **1 point**.
- Makers take all 5 (a "march" or sweep): **2 points**.
- Makers fail to take 3 (**euchred**): defenders get **2 points**.
- Loner sweeps all 5 alone: **4 / 6 / 8 points** per tier (§2), instead of the standard 2.
  **OPEN**: what does a loner get if they don't sweep — same 1 point as a normal make if
  they take 3–4? Assumed yes (loner only changes the *sweep* bonus, not the make-a-majority
  case), please confirm. What if the loner is euchred — still 2 points to defenders,
  standard?
- Game to **OPEN** points (10 is the euchre standard; confirm).

## 8. Misc / OPEN items to close before Phase 1

- [ ] Misdeal conditions (e.g. flawed deal, exposed card during deal) — do they exist in
      this variant, or is a misdeal simply not possible given the mechanics?
- [ ] Does the blind hand ever get revealed to its owner (or both players) at the end of a
      deal for verification/curiosity, or does an unplayed loner hand, for instance, stay
      forever unseen by the table?
- [ ] Dealer alternates every deal — confirmed standard, or something else?
- [ ] The "few crazy rules" mentioned but not yet specified — bring these to the Phase 0
      session.
- [ ] Confirm point target for winning the game (assumed 10).

---

**Status**: Draft v0.1. Core shell captured from initial conversation. Several structural
OPEN items above (especially §6 trick rotation, and §2 declaration-window mechanics) need
your direct confirmation before any engine code is written — they materially change the
`reduce`/`legalActions` implementation, not just a config value.
