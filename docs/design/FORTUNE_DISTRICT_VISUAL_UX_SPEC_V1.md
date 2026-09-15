# Fortune District --- Visual & UX Specification v1

*Design only. No files changed, no code, no rule changes. Engine,
simulator, rules, board order, movement, auctions, Debt, Leverage, City
Pulse and scoring are treated as frozen inputs.*

------------------------------------------------------------------------

## 1. Design philosophy --- "District at Dusk"

Fortune District is a race to build the most valuable slice of a living
city in twelve rounds. The visual world should feel like **standing on a
rooftop at dusk, looking down at a district that is switching on** ---
parcels lighting up as players claim them, the economy pulsing through
neighbourhoods, everyone still in the game to the end.

Three commitments follow from that:

1.  **The district is the board.** The 24 tiles are city parcels drawn
    as hexagonal blocks on a hexagonal ring --- a loop that reads as
    a *district*, not a track. Nothing about the tile count, order or
    rules changes; only the shape the loop is drawn in.
2.  **The economy is visible, not tabulated.** Money, ownership and
    Pulse are shown as light, colour and motion on the district first,
    and as numbers second. Cash and Net Worth are always readable, but
    the screen should never look like a spreadsheet.
3.  **One thing glows.** At any moment exactly one element carries the
    accent light: the current decision. Everything else is calm dusk
    tones. That is how a first-time player always knows where to look.

Why it fits: "premium + energetic + approachable" is achieved by a dark,
calm base (premium), one electric accent and light-trail motion
(energetic), rounded geometry and generous type (approachable). It is
distinct from Monopoly/RichUp (square track, colour bars, cards), from
casinos (no gold/red/felt), from banking dashboards (no grids of KPIs),
and from cyberpunk (no neon overload, no glitch --- light is warm and
civic, not hostile).

------------------------------------------------------------------------

## 2. Design system

### 2.1 Colour

**Base (dusk neutrals)**

  TokenHexUse
  ------------- --------- ----------------------
  `dusk-900`    #0F1420   page background
  `dusk-800`    #171D2B   board field
  `dusk-700`    #232B3D   cards / panels
  `dusk-600`    #303A50   borders, dividers
  `ivory-100`   #F5F1E8   primary text on dark
  `ivory-300`   #C9C4B8   secondary text
  `ivory-500`   #8E8A80   muted text, disabled

**Accent (the "one thing glows")**

  ---------------------------------------------------------------------------------
  TokenHexUse
  -------------- ---------------------- -------------------------------------------
  `pulse-400`    #3EE0C8                primary action, current decision, active
                                        player halo

  `pulse-600`    #19B39E                pressed/hover primary

  `pulse-glow`   rgba(62,224,200,.35)   outer glow on the action panel and active
                                        token
  ---------------------------------------------------------------------------------

**Semantic**

  TokenHexUse
  ------------- --------- ------------------------------------
  `gain`        #7CE38B   money received, Net Worth up
  `loss`        #FF7A6B   money paid, debt, suppressed Pulse
  `warn`        #FFC857   timer \< 10 s, cap hit
  `info`        #8FB4FF   announcements (Pulse coming)
  `neutral`     #A9B1C3   unowned "for sale"

**Player identities** --- colour **+** symbol **+** initial, always
together (§7)

  SeatNameHexSymbol
  ------------------- --------- --------- ---
  1                   Crimson   #E5484D   ■
  2                   Azure     #22A6F0   ●
  3                   Emerald   #2FBF71   ▲
  4                   Violet    #9B6DFF   ◆

**Property categories** --- muted "district" tints so they never compete
with player colours; each also has an icon and 3-letter code (§6)

  CategoryCodeHex (tint)Hex (strong)
  ------------------------------------ ----- --------- ---------
  Residential                          RES   #D9A98F   #C2703E
  Tech                                 TEC   #9FA8FF   #5B6CFF
  Leisure                              LEI   #F5A3B8   #E8577B
  Industry                             IND   #C7B08A   #A8853B
  Energy                               ENE   #F6D98A   #E5B63A
  Transit                              TRA   #8AD3CB   #2AA198

Rule: player colours are saturated and appear only on things a player
*owns or is*; category colours are tints and appear only on parcels. The
two never occupy the same element at the same intensity.

### 2.2 Typography

  ------------------------------------------------------------------------------------
  RoleFaceSize /
  weightNotes
  ------------------------- ----------------------- ----------------- ----------------
  Display (decision         **Sora** (geometric,    28--36 / 700      letter-spacing
  headline, round           rounded terminals)                        −1%
  transition, winner)

  Heading (panel titles)    Sora                    18--20 / 600

  Body                      **Inter**               15--16 / 400--500 line-height 1.45

  Numbers (money, timer,    Inter, `tabular-nums`   16--48 / 600--700 never
  dice total)                                                         proportional

  Labels / codes            Inter                   11--12 / 700,     RES, YOU, SEALED
                                                    uppercase, +6%
                                                    tracking

  Tile names                Sora                    12--13 / 600
  ------------------------------------------------------------------------------------

Minimum body size 15 px; minimum on-tile size 11 px.

### 2.3 Spacing, radius, elevation

-   Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48.
-   Radius: parcels 6 (hex clip-path, rounded corners); buttons 10;
    cards 14; tokens 999.
-   Elevation: 0 flat (board field) · 1 card
    (`0 1px 2px rgba(0,0,0,.4)`) · 2 raised
    (`0 6px 18px rgba(0,0,0,.45)`) · 3 **decision** (raised
    + `0 0 0 3px pulse-400` + `0 0 32px pulse-glow`). Only one
    elevation-3 element per screen.
-   Borders: 1 px `dusk-600`; ownership borders 2 px player colour.

### 2.4 Icon & illustration style

-   Icons: 2 px rounded-stroke line icons on a 24 grid; category glyphs
    are **solid duotone** (strong colour on tint) so they read at 16 px.
-   Illustration: flat, low-detail isometric city blocks with long dusk
    shadows; two-tone shading; no outlines. Used only for parcel art and
    the setup/hero --- never for UI chrome.

### 2.5 Interaction states

  -----------------------------------------------------------------------
  StateTreatment
  -------------------- --------------------------------------------------
  Default              as specified

  Hover                +6 % lightness, cursor pointer

  Focus                2 px `pulse-400` ring, 2 px offset (keyboard)

  Pressed              −6 % lightness, translateY(1px)

  Disabled             40 % opacity, tooltip explains why (from the
                       engine's reason)

  Selected (tile)      3 px `pulse-400` outline

  Danger (Decline, No  outlined `loss`
  bid)
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 3. Component library

**Button** --- purpose: any command. Height 48 (desktop) / 56 (touch);
radius 10; label Inter 16/600; icon left optional. States as §2.5.
Beginner rule: a button label is always a verb + object ("Buy Kestrel
Row", "Move 7"), never a noun.

**Primary Button** --- the one glowing thing. Fill `pulse-400`, text
`dusk-900`, elevation 3 when it is the current decision. Exactly one per
screen. 20 px label, min width 200.

**Secondary Button** --- outlined 2 px `ivory-300`, text `ivory-100`;
danger variant outlined `loss`. Used for Decline, No bid, Keep it,
optional actions.

**Property Tile (parcel)** --- purpose: show one property's state at a
glance. Hexagon, 92 px across on desktop. Layers top→bottom: ownership
ring (2 px player colour, or none), category tint fill, category glyph
(top-left, 16 px) + code, tile name (centre), price/yield micro-line
(bottom), upgrade pips ◇◇ / ◆◇ / ◆◆ (bottom-right), owner chip
(bottom-left: symbol+initial in player colour; reads **YOU** for the
viewer), pawn slots (up to 4 tokens along the bottom edge). States:
unowned (dashed `neutral` ring, "for sale" chip), owned-by-other,
**mine** (ring `pulse-400` + player colour inner, YOU chip),
set-complete (thin gold-less "×2" chip in category strong colour on all
three parcels), landing highlight (pulse ring 600 ms), auction (hammer
chip, `info` ring). Beginner: name and owner chip are the two largest
things on the parcel.

**Special Tile** --- same hexagon, `dusk-700` fill, white line icon 28
px, name below, one-line effect on hover/tap. The six specials sit on
the six **corners** of the ring (they are tiles 0/4/8/12/16/20 --- every
fourth tile --- which is exactly the corners of a 4-per-side hexagonal
ring; no reordering needed). District Hub is larger (110 px) at the top
corner.

**Player Token** --- 28 px pill: player colour fill, symbol + initial in
ivory ("■ M"). Sizes 20/28/40. Active-player token carries a
`pulse-glow` halo. Appears on parcels, player cards, status bar,
auction, results.

**Player Card** --- purpose: one player's financial position. 280×88
(compact) / 280×140 (self, expanded). Row 1: token + name +
YOU/last-place chip. Row 2: **Cash** (large, 24 tabular) · **Net Worth**
(large). Row 3 (only when non-zero): Debt chip (`loss`), Credit chip
(`ivory-300`), Leverage tokens as ◈ icons. Self card has elevation 2 and
a 4 px left bar in player colour; the active player's card pulses its
halo. Last place: small chip "⚑ last · gets Leverage each round"
(tooltip explains).

**Status Bar** --- 56 px, full width: left `ROUND 5 / 12` with a
12-segment progress rail (Pulse rounds 4/7/10 marked with a small ◉);
centre active token + "Maya's turn · Make your move"; right timer. Never
repeated elsewhere.

**Action Panel** --- the decision surface (elevation 3), always in the
same place (centre of the ring on desktop; bottom sheet on narrow).
Fixed internal order: *What just happened* strip → decision headline →
context line → **primary** → secondary/optional row. Never more than one
primary. Height adapts; content never below the fold.

**Dice** --- two 72 px dice (rounded squares, ivory face, `dusk-900`
pips), total shown as a 48 px number with "= 7". Reveal animation ≤ 800
ms (§12). Both dice always visible; the total is the hero. No "roll"
button: the engine already rolled at turn start; the reveal is the
moment.

**Timer** --- 18 px tabular seconds beside a 4 px ring around the active
token; `warn` under 10 s, `loss` under 5 s with a gentle tick pulse.
Appears in the status bar and mirrored as the ring on the action panel's
token. Never elsewhere.

**Money HUD** --- the self card doubles as HUD. Money changes animate as
floating deltas ("+₵150", "−₵50") in `gain`/`loss` next to the Cash
figure, then settle.

**City Pulse Card** --- §8. Two stacked stripes: ACTIVE (solid) and NEXT
(dashed, `info`), each showing boosted ▲ ×1.5 and suppressed ▼ ×0.6 with
category glyphs.

**Leverage Card** --- §I. Token count as ◈ icons; two option cards side
by side with one-line effects; the option cards are disabled with reason
when not legal.

**Auction Card** --- §9. Parcel preview, list price, minimum bid, cash,
private bid entry, sealed state, bidder progress, reveal.

**Event/Recap Card** --- "What just happened" / "Since your last turn":
ivory strip with 4 px `pulse-400` left bar, up to 6 plain-language
lines, each with a small icon (₵, ◈, ▲, ⏱) and money deltas coloured.

**Error message** --- inline under the decision headline, `loss` text
with an icon, plain language; disappears on the next successful action.

**Tooltip** --- 240 px max, `dusk-700`, ivory text, 300 ms delay, on any
dotted-underlined term (yield, cap, debt, credit line, Leverage, Pulse,
Net Worth).

**Round transition** --- full-width banner sliding over the status bar
for 1.2 s: "ROUND 6" + the round's start-of-round facts (interest,
Leverage grant, Pulse announced/active) as chips.

**End-game scoreboard** --- podium row of tokens, then a ranked table
with Net Worth bars decomposed into cash / property / upgrades / −debt /
−credit segments.

------------------------------------------------------------------------

## 4. Screen-by-screen wireframes (desktop, \~1280 wide)

Shared frame used by B--N:

svg

    ┌───────────────────────────────────────────────────────────────────────────────┐
    │ ROUND 5/12 ▮▮▮▮▮▯▯▯▯▯▯▯      ● R  Ravi's turn · Make your move        ⏱ 24 s │
    ├────────────────────────────────────────────┬──────────────────────────────────┤
    │                                            │  ● R  Ravi          YOU          │
    │              HEX DISTRICT RING             │  Cash ₵740     Net worth ₵1,510  │
    │      (24 parcels, Hub at top corner)       │  [Debt ₵60] [◈◈]                 │
    │                                            │  ─────────────────────────────── │
    │            ┌────────────────────┐          │  ■ M Maya   ₵910   NW ₵1,480     │
    │            │   ACTION PANEL     │          │  ▲ L Lee    ₵380   NW ₵1,320 ⚑   │
    │            │   (elevation 3)    │          │  ─────────────────────────────── │
    │            └────────────────────┘          │  CITY PULSE                      │
    │                                            │  ACTIVE  ▲ TEC ×1.5  ▼ IND ×0.6  │
    │                                            │  NEXT R7 ▲ LEI ×1.5  ▼ ENE ×0.6  │
    │                                            │  ─────────────────────────────── │
    │                                            │  LOG (last 8) ▸                  │
    └────────────────────────────────────────────┴──────────────────────────────────┘

**A. Match setup**

svg

    ┌──────────────────────────────────────────────┐
    │  [hero: dusk district illustration]          │
    │  FORTUNE DISTRICT                            │
    │  12 rounds · richest district wins           │
    │                                              │
    │  PLAYERS   (2) (3) (4)                       │
    │  ■ Crimson  [ Maya      ]                    │
    │  ● Azure    [ Ravi      ]                    │
    │  ▲ Emerald  [ Lee       ]                    │
    │  TIMER   (30 s playtest) (20 s official) (off)│
    │  ▸ Advanced: seed                            │
    │                                              │
    │            [ ▶ START MATCH ]                 │
    │            resume saved match                │
    └──────────────────────────────────────────────┘

Beginner: identity is assigned visibly before play; the token next to
each name is the one they'll see on the board.

**B. Normal turn (turn start, dice already generated)**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │  ⚂  ⚃   = 7                                │
    │  You rolled 3 + 4 = 7. Move 7 forward.     │
    │                                            │
    │            [ ▶ MOVE 7 ]                    │
    └────────────────────────────────────────────┘

**C. After dice result → landing (unowned)**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ WHAT JUST HAPPENED                         │
    │ ◉ You passed the District Hub  +₵150       │
    │ ◉ You landed on Neon Arcade                │
    │────────────────────────────────────────────│
    │ [LEI hex] NEON ARCADE · Leisure · tier 1   │
    │ Nobody owns it. Price ₵100 · pays ₵15      │
    │ when an opponent lands here. You have ₵740.│
    │                                            │
    │  [ ▶ BUY FOR ₵100 ]   [ send to auction ]  │
    └────────────────────────────────────────────┘

**D. Property purchase (confirmation moment)**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ ✓ You bought Neon Arcade for ₵100          │
    │   Cash ₵740 → ₵640 · Net worth unchanged   │
    │   (the ₵100 now counts as property)        │
    │────────────────────────────────────────────│
    │ Your move is done.                         │
    │            [ ▶ END TURN ]                  │
    │ Optional: [Upgrade a property ▾] [◈ Leverage]│
    └────────────────────────────────────────────┘

Board: Neon Arcade's hex gains the player ring and the **YOU** chip with
a 600 ms light-up.

**E. Declined → auction opens**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ ⚖ NEON ARCADE goes to sealed auction       │
    │ Everyone bids in secret — including you.   │
    │ Minimum ₵50 · highest bid wins             │
    │ Ties: the bidder furthest from the Hub     │
    │                                            │
    │        [ ▶ PASS THE KEYBOARD ]             │
    └────────────────────────────────────────────┘

**F. Sealed bid (private screen after hand-off)**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ PLACE YOUR BID                      ⏱ 9 s  │
    │ [LEI hex] NEON ARCADE · list ₵100 · pays ₵15│
    │ Minimum ₵50 · you have ₵910                │
    │                                            │
    │   ₵ [  75 ]   (min) (list) (½ cash)        │
    │                                            │
    │   [ ▶ SEAL MY BID ]      [ no bid ]        │
    │                                            │
    │ Bidders: ● Ravi ✓ sealed · ■ Maya ← you · ▲ Lee …│
    └────────────────────────────────────────────┘

After sealing: a 1.2 s "SEALED ✓" stamp, amount hidden, then the
hand-off screen.

**G. Auction reveal (shown to the opener's keyboard when the host
closes)**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ AUCTION RESULT · Neon Arcade               │
    │  ■ Maya  ₵75    ● Ravi  ₵50    ▲ Lee  —    │
    │                                            │
    │  ★ ■ Maya wins for ₵75                     │
    │    (if tie) tie → furthest from the Hub    │
    │                                            │
    │            [ ▶ CONTINUE ]                  │
    └────────────────────────────────────────────┘

Board: parcel flips to Maya's ring; her token gets a brief halo.

**H. Upgrade (optional action expanded)**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ CHOOSE YOUR UPGRADE        one per turn    │
    │ ┌ Helix Reactor ENE ◆◇ ─ ₵130 ─ pays ₵80→₵110 ┐ [UPGRADE]
    │ ┌ Neon Arcade  LEI ◇◇ ─ ₵50  ─ pays ₵15→₵24  ┐ [UPGRADE]
    │ ┌ Kestrel Row  RES ◆◆ ─ max level             ┐  —
    │                                            │
    │            [ ▶ END TURN ]     [ back ]     │
    └────────────────────────────────────────────┘

Only rows with a legal `UPGRADE_PROPERTY` have a live button; Exchange
turns show "20 % off this turn" and the discounted price.

**I. Leverage**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ ◈◈ LEVERAGE — you have 2 tokens            │
    │ ┌────────────────────┐ ┌──────────────────┐│
    │ │ ⚖ FORCE AUCTION    │ │ ₵ CREDIT LINE    ││
    │ │ Put any unowned    │ │ Take ₵200 now,   ││
    │ │ parcel up for      │ │ interest-free.   ││
    │ │ sealed bids. You   │ │ Counts against   ││
    │ │ may bid too.       │ │ net worth at end.││
    │ │ [choose parcel ▾]  │ │                  ││
    │ │ [ FORCE AUCTION ]  │ │ [ TAKE ₵200 ]    ││
    │ └────────────────────┘ └──────────────────┘│
    │ Costs 1 token each.            [ back ]    │
    └────────────────────────────────────────────┘

**J. Debt state (after a capped payment)**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ WHAT JUST HAPPENED                         │
    │ ◉ You landed on Helix Reactor (▲ Lee)      │
    │ − You paid Lee ₵50 of ₵110                 │
    │   Payments are capped at ¼ of your cash.   │
    │ ⚠ ₵60 was added to your debt               │
    │   Debt grows 10 % at the start of each     │
    │   round. Half of any money you receive     │
    │   repays it automatically.                 │
    │────────────────────────────────────────────│
    │            [ ▶ END TURN ]                  │
    └────────────────────────────────────────────┘
    Self card: Cash ₵150   Net worth ₵1,290   [Debt ₵60 ↑10%/round]

**K. City Pulse announcement (start of R3/6/9, shown in the round banner
and the Pulse card)**

svg

    ┌ ROUND 6 ───────────────────────────────────────────────┐
    │ ◉ CITY PULSE ANNOUNCED for round 7                     │
    │   ▲ LEISURE will earn ×1.5     ▼ ENERGY will earn ×0.6 │
    └────────────────────────────────────────────────────────┘
    Pulse card:  ACTIVE  ▲ TEC ×1.5 ▼ IND ×0.6 (R4–6)
                 NEXT ─ R7 ▲ LEI ×1.5 ▼ ENE ×0.6   (dashed, info)
    Board: LEI parcels get a faint dashed ▲ ring; ENE parcels a dashed ▼ ring.

**L. City Pulse active (start of R4/7/10)**

svg

    ┌ ROUND 7 ───────────────────────────────────────────────┐
    │ ⚡ CITY PULSE ACTIVE                                    │
    │   ▲ LEISURE earns ×1.5   ▼ ENERGY earns ×0.6           │
    └────────────────────────────────────────────────────────┘
    Board: LEI parcels glow warm (solid ▲ chip); ENE parcels dim (solid ▼ chip);
           yield micro-line on affected parcels shows "₵30 → ₵45".

**M. Round transition**

svg

    ┌────────────────────────────────────────────────────────┐
    │                     ROUND 8 / 12                       │
    │  ₵ Interest: ▲ Lee +₵6 debt · ◈ Leverage → ▲ Lee (last)│
    │  ◉ Pulse active: ▲ LEI ×1.5 ▼ ENE ×0.6                 │
    └────────────────────────────────────────────────────────┘
    (1.2 s slide-in over the status bar, then the hand-off screen)

**N. Timeout**

svg

    ┌ ACTION PANEL ──────────────────────────────┐
    │ ⏱ TIME RAN OUT                             │
    │ The property was sent to auction for you.  │
    │ (or: your move was made for you /          │
    │      your turn was ended for you)          │
    │────────────────────────────────────────────│
    │        [ ▶ PASS THE KEYBOARD ]             │
    └────────────────────────────────────────────┘

**O. Hand-off**

svg

    ┌──────────────────────────────────────────────┐
    │ Round 5 of 12 · next turn                    │
    │                                              │
    │     PASS THE KEYBOARD TO   ■ M  MAYA         │
    │                                              │
    │ SINCE YOUR LAST TURN                         │
    │ + Ravi landed on Kestrel Row and paid you ₵15│
    │ ◉ City Pulse announced for round 7 …         │
    │                                              │
    │              [ ▶ I'M READY ]                 │
    │         (your timer starts when you press)   │
    └──────────────────────────────────────────────┘

Auction hand-offs add "Everyone else: look away --- bids are secret."

**P. Final results**

svg

    ┌──────────────────────────────────────────────────────────┐
    │               ■ M  MAYA WINS THE DISTRICT                │
    │               Net worth ₵1,740                           │
    │   ▲ Lee ₵1,520     ● Ravi ₵1,410                         │
    │──────────────────────────────────────────────────────────│
    │ #  Player   Net worth  [cash|property|upgrades|−debt|−credit]  Owned Sets │
    │ 1  ■ Maya   ₵1,740     ████████▓▓▓▓░░                    6     1   │
    │ 2  ▲ Lee    ₵1,520     ██████▓▓▓░░▒                      5     0   │
    │ 3  ● Ravi   ₵1,410     █████▓▓░░▒▒                       5     0   │
    │ Auctions 15 (nobody bid 3) · seed 8812                   │
    │        [ ▶ PLAY AGAIN ]   [ copy event log ]             │
    └──────────────────────────────────────────────────────────┘

------------------------------------------------------------------------

## 5. Board design --- the hexagonal district ring

**Geometry.** Arrange the 24 tiles as a **hexagonal ring with 4 tiles
per side** (6 sides × 4 = 24, corners shared). Tile 0 (District Hub) is
the top corner; tiles run clockwise. Because the specials are tiles 0,
4, 8, 12, 16, 20 --- every fourth tile --- they fall **exactly on the
six corners**, and each side reads as "corner landmark + three parcels".
This is a property of the existing order; nothing is reordered.

svg

                     [HUB 0]
                23 ╱         ╲ 1
              22 ╱             ╲ 2
            21 ╱                 ╲ 3
       [WIND 20]                  [RELAY 4]
            19 ╲                 ╱ 5
              18 ╲   ACTION    ╱ 6
            17 ╱    PANEL     ╲ 7
       [EXCH 16]                  [AUDIT 8]
            15 ╲                 ╱ 9
              14 ╲             ╱ 10
                13 ╲         ╱ 11
                   [RELAY 12]

**Readability rules.** Parcels are flat-top hexagons of equal size;
specials are the same hexagon in `dusk-700` with a larger icon (Hub 20 %
larger). A faint clockwise light rail runs along the outside edge of the
ring with a direction chevron every side, so "which way do I move" is
never a question. Tile numbers are printed small on the outer edge. The
centre of the ring holds the action panel --- the eye goes parcel →
centre → decision. At narrow widths the ring shrinks and the panel
becomes a bottom sheet; the geometry is percentage-based.

**District feel.** The field behind the ring is a dark isometric street
map (asset §13) with soft dusk lighting; parcels "switch on" when owned
(their tint brightens and a tiny window-light texture appears). Pawns
travel along the rail as light trails. No text on the field; everything
legible is on parcels, chips or panels.

------------------------------------------------------------------------

## 6. Property visual language

  ------------------------------------------------------------------------------
  CategoryCodeIcon
  conceptIdentityTile
  treatment
  --------------------- ----- ----------------- ----------- --------------------
  Residential           RES   stacked terraces  warm clay,  clay tint, terrace
                              with a balcony    rounded     silhouette in the
                                                rooflines   parcel corner

  Tech                  TEC   circuit-node      indigo,     indigo tint, node
                              tower (three      crisp       glyph
                              nodes, one spire) geometry

  Leisure               LEI   ferris/arc with a coral,      coral tint, arc
                              star              playful     glyph
                                                curve

  Industry              IND   gantry crane over ochre       ochre tint, gantry
                              a crate           steel,      glyph
                                                angular

  Energy                ENE   sun-disc over a   solar gold, gold tint, disc
                              pylon             radial      glyph

  Transit               TRA   rail loop with an teal,       teal tint, loop
                              arrow             motion line glyph
  ------------------------------------------------------------------------------

Every parcel shows **glyph + code + tint** together; tier is shown as
three pips (▮▯▯ / ▮▮▯ / ▮▮▮) next to the name, never as "T2". Set
completion: the three parcels of the category share a thin strong-colour
outer arc and a "×2" chip; the owner's property list shows "3 of 3 ---
set complete".

------------------------------------------------------------------------

## 7. Player identity

Crimson ■, Azure ●, Emerald ▲, Violet ◆ --- assigned by seat at match
start and shown on the setup screen. The same 28 px token ("■ M")
appears: on the parcel owner chip; as the pawn; on the player card; in
the status bar (with halo when active); on the auction bidder row and
reveal; on the podium. The viewer's own token always carries a **YOU**
label next to it and their parcels carry the `pulse-400` outer ring, so
"mine" is a shape/glow difference, not a colour difference. Names are
never truncated below 8 characters; initials are the fallback.

------------------------------------------------------------------------

## 8. City Pulse visual design

Pulse is the signature: it is the only thing in the game that changes
the *whole district's* light.

-   **Upcoming Pulse** (announced R3/6/9): the Pulse card shows a
    dashed `info` stripe "NEXT · R7 ▲ LEI ×1.5 ▼ ENE ×0.6"; affected
    parcels get a faint dashed ring in their category colour with a
    small ▲/▼; the status-bar round rail marks R7 with ◉. Beginner line
    under the card: "Leisure parcels will pay 1.5× from round 7; Energy
    parcels 0.6×."
-   **Active Pulse** (R4--6, R7--9, R10--12): solid stripe "ACTIVE ▲ TEC
    ×1.5 ▼ IND ×0.6"; boosted parcels glow warm with a solid ▲ chip,
    suppressed parcels dim 20 % with a ▼ chip; each affected owned
    parcel's yield micro-line shows the adjusted number.
-   **Transition** (start of a Pulse round): a 1.2 s wave of light
    sweeps clockwise around the ring; boosted parcels brighten as it
    passes, suppressed dim; the round banner reads "CITY PULSE ACTIVE".
    A reroll (Pulse Relay) plays the same sweep in reverse on
    the *next* stripe only and stamps "REROLLED".
-   The three Pulses are shown as three ◉ marks on the round rail so
    players always know how many remain.

------------------------------------------------------------------------

## 9. Auction UX (sealed rules unchanged)

Trigger card → private bid card → sealed stamp → progress row → reveal,
as wired in §4 E--G. Specifics: the parcel preview is the same hex as on
the board; **list price** and **minimum bid** are two labelled figures
side by side; "you have ₵910" is beside the input; quick chips (min /
list / ½ cash) reduce typing under a 10 s timer; the timer ring sits on
the input; "SEALED ✓" confirms submission without showing the amount;
the progress row shows tokens with ✓/...; the reveal lists every bid
with tokens, highlights the winner with a halo, and explains a tie in
one line. Ascending auctions are noted as a future candidate only.

------------------------------------------------------------------------

## 10. Economic information hierarchy

  ----------------------------------------------------------------------------------
  ConceptWhereHow
  ----------------- ---------------------------------- -----------------------------
  **Cash**          self card, large; floating deltas  "what I can spend now" ---
                                                       the only number a beginner
                                                       must track

  **Net Worth**     self card, large; tooltip formula; "the score" --- always next
                    results bars                       to Cash so the two are never
                                                       confused

  **Debt**          chip on self card only when \> 0;  never a column of "---"
                    recap explains cap and 10
                    %; `loss` colour

  **Credit Line**   chip only when \> 0: "₵200 credit
                    · counts against net worth"

  **Yield**         on the parcel (micro-line) and in  shown as *what this parcel
                    the upgrade list ("pays ₵30 →      pays me*, adjusted for set
                    ₵48")                              and Pulse

  **Upgrade**       pips on parcel; cost and
                    yield-after in the upgrade row

  Others' numbers   compact cards: Cash · NW only;     enough to know who is
                    chips for debt/tokens              winning, no more
  ----------------------------------------------------------------------------------

The players table becomes cards; no six-column grid anywhere in play.

------------------------------------------------------------------------

## 11. Beginner experience (contextual, no tutorial)

-   The **What just happened** strip is the tutorial: every event line
    pairs the fact with its one-line reason, in the player's own words
    ("Payments are capped at ¼ of your cash; the rest became debt").
-   **First-time callouts** (once per browser, dismissible, anchored):
    first landing on a parcel for sale; first yield paid; first debt;
    first Leverage token; first Pulse announcement; first
    Exchange/Windfall/Relay.
-   **Dotted-underline terms** everywhere with tooltips; a
    persistent **?** opens the rules card and the Net Worth formula.
-   Every disabled option says why ("You need ₵130 to upgrade this").

------------------------------------------------------------------------

## 12. Animation system (gameplay-communicating only; all ≤ 1.2 s; honour `prefers-reduced-motion`)

  -------------------------------------------------------------------------------
  MomentAnimation
  ----------------- -------------------------------------------------------------
  Dice              800 ms tumble, total counts up, then the Move button lights

  Movement          pawn slides along the rail 120 ms per tile with a light
                    trail; Hub crossing flashes the Hub and floats "+₵150"

  Purchase          parcel "switches on": ring draws in, tint brightens, YOU chip
                    pops (600 ms)

  Income / payment  floating "+₵" / "−₵" deltas at the Cash figure; recipient's
                    token glows once

  Auction           SEALED stamp (300 ms); reveal fans bids in left→right (400
                    ms); winner halo

  Pulse             clockwise light sweep (1.2 s); parcels brighten/dim as it
                    passes

  Leverage          token ◈ spins out of the player card into the action (500 ms)

  Timer             ring drains; under 10 s a soft tick pulse each second

  Round transition  banner slides down and up (1.2 s)

  Victory           winner's parcels light up in sequence around the ring, then
                    podium rises (2 s)
  -------------------------------------------------------------------------------

------------------------------------------------------------------------

## 13. Art / image asset plan

  -------------------------------------------------------------------------------------------------------------------------
  AssetPurposeStyleRatioTransparentWhere
  ------------------------------------------------------ ----------------------- ---------------- ------ ------- ----------
  `district-field`                                       board background        flat isometric   1:1    no      behind the
                                                                                 dusk street map,                ring
                                                                                 low detail, dark

  `hero-dusk`                                            setup screen header     isometric        16:9   no      setup
                                                                                 district skyline
                                                                                 at dusk, warm
                                                                                 horizon

  `parcel-res` ... `parcel-tra` (6)                      parcel corner art per   flat duotone     1:1    yes     parcels
                                                         category                block
                                                                                 silhouettes

  `icon-cat-res` ... `icon-cat-tra` (6)                  category glyphs         solid duotone,   1:1    yes     parcels,
                                                                                 24 grid                 (SVG)   Pulse
                                                                                                                 card,
                                                                                                                 lists

  `icon-special-hub/relay/audit/exchange/windfall` (5)   special tile icons      2 px rounded     1:1    yes     corners
                                                                                 line, 28 grid           (SVG)

  `icon-ui-set` (\~14)                                   dice, timer, hammer,    2 px rounded     1:1    yes     chrome
                                                         token ◈, upgrade pip,   line                    (SVG)
                                                         arrows, ✓, ⚑, ?, log,
                                                         copy

  `dice-face-1..6`                                       dice                    ivory rounded    1:1    yes     action
                                                                                 square, dark                    panel
                                                                                 pips

  `pulse-sweep`                                          Pulse transition light  soft radial      2:1    yes     overlay
                                                                                 gradient sprite

  `podium-glow`                                          results                 warm glow plate  3:1    yes     results
  -------------------------------------------------------------------------------------------------------------------------

No full-UI images; every panel is built from the design system.

------------------------------------------------------------------------

## 14. Final visual direction --- one recommendation

**"District at Dusk."** A dark, calm indigo-slate field with warm ivory
panels; a **hexagonal ring of hexagonal parcels** with the six landmarks
on its corners and the decision glowing in its centre; six muted
district tints with solid glyphs for categories; four saturated
jewel-tone identities with symbols; a single electric teal for "what you
do now"; light as the language of the economy --- parcels switch on when
owned, the Pulse sweeps the ring, money floats as light. Recognisable in
one frame by the hex ring + centre panel + dusk palette; nothing in it
resembles a square track, colour bars, cards, felt or neon streets.

------------------------------------------------------------------------

## 15. Implementation hand-off (concise spec for a frontend developer)

1.  **Tokens** --- implement §2 as CSS custom properties
    (`--dusk-*`, `--ivory-*`, `--pulse-*`,
    semantic, `--player-1..4`, `--cat-res..tra` tint/strong); fonts
    Sora + Inter (self-hosted or Google
    Fonts), `font-variant-numeric: tabular-nums` on all money/timer.
2.  **Board** --- render the 24 tiles at fixed positions on a 4-per-side
    hexagonal ring (index 0 top corner, clockwise); positions are a pure
    function of index; specials are indices divisible by 4. Flat-top hex
    via `clip-path`; centre region reserved for the action panel;
    percentage geometry for responsiveness.
3.  **Components** --- Button (primary/secondary/danger), Parcel,
    SpecialTile, Token, PlayerCard, StatusBar, ActionPanel, Dice, Timer,
    PulseCard, LeverageCard, AuctionCard, RecapCard, Tooltip,
    RoundBanner, Scoreboard --- per §3, each driven only by engine
    state, `legalCommands` and event payloads already available
    (`PAYMENT_MADE.capped`, `DEBT_REPAID`, `LEVERAGE_TOKEN_GRANTED`, `WINDFALL_RECEIVED.wasLast`, `CITY_PULSE_*`, `AUCTION_RESOLVED.tieBroken`, `TURN_TIMED_OUT.step`).
4.  **State machine → screens** --- map engine `phase`/`step` to screens
    B--P exactly as §4; one primary button per screen; the "what
    happened" strip built from the last command's events (or events
    since the player's last turn on hand-off).
5.  **Motion** --- §12 durations;
    one `@keyframes` set; `prefers-reduced-motion` disables all but
    state changes.
6.  **Assets** --- §13 list; SVG for icons, PNG/WebP for field and hero;
    all others CSS.
7.  **Non-goals** --- no rule logic in the client, no
    destination-preview beyond what the state already shows, no
    ascending auction, no engine helpers added.

Stopping here --- no files changed, no code written. Awaiting your
approval before any implementation.
