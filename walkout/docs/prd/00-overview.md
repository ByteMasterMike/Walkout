# PRD Module 00 — Overview

**Read first. Every agent loads this module.**

Source: WALKOUT PRD v5.2 (April 2026). Sections 1–5 of the full PRD. For details beyond what is here, see the module map in `CLAUDE.md`.

---

## 1. Executive Summary

WalkOut is a full-stack restaurant operating system. It replaces the Point of Sale, the Kitchen Display System, cash management, and the card terminal in a single web platform that runs on any browser-enabled device the restaurant already owns.

### The Zero-Sunk-Cost POS

Every competing POS (Toast, Square for Restaurants, Lightspeed) charges restaurants in three places: monthly SaaS ($0–$165), proprietary hardware ($627–$1,200+), and a processing markup above interchange. WalkOut charges none of these:

- Software: **free** for restaurants
- Hardware: **BYOD** (WalkOut ships pre-programmed NFC stickers only)
- Processing: **2.9% + $0.30**, identical to Square's rate

WalkOut's revenue comes from a transparent 0.5% consumer-side service fee added to the diner's bill.

### The Payment Innovation

For account-holder diners: sit down, eat, walk out. No check. No payment screen. No waiting.

The authorize-on-arrival, capture-on-departure model:

1. Diner taps NFC sticker. Tab opens. Auth hold placed on card immediately.
2. Card proven before any food is ordered. No post-meal surprises.
3. On departure the actual total (food + tax + service fee + tip) is captured against the hold.
4. Excess hold releases automatically.
5. Receipt sent to the diner's phone.

### Complete Money Flow on a $50 Meal + $10 Tip

```
ONE CHARGE (fires after tip is resolved):
  Food & drinks:       $50.00   ← diner's food cost
  PA Sales Tax (6%):    $3.00   ← diner pays, restaurant remits to PA
  WalkOut Service Fee:  $0.25   ← 0.5% of $50 (WalkOut's revenue)
  Tip:                 $10.00   ← 20% default if no explicit choice
  ────────────────────────────
  Card charged:        $63.25

  Stripe processing:    $2.14   ← 2.9% × $63.25 + $0.30 (ONE flat fee)
  WalkOut app fee:      $0.25   ← deducted by Stripe Connect

PRO-RATA FEE ALLOCATION (§17.8):
  Stripe fee split by portion of total:
    Tip's share:        $0.34   ← ($10.00 / $63.25) × $2.14
    Food+tax+fee share: $1.80

TOTAL OUT OF DINER'S WALLET: $63.25
  → WalkOut:       $0.24  ($0.25 gross − fee share)
  → Stripe:        $2.14
  → Pennsylvania:  $2.90  (tax, via restaurant quarterly remittance)
  → Restaurant:   $48.31  (food net after fee share)
  → Server (tip): $ 9.66  ($10.00 gross − $0.34 fee share)
  ─────────────────────
  TOTAL:          $63.25  ✓
```

**Critical tax note.** Stripe processes the full $63.25 INCLUDING tax. There is no architecture where a processor exempts tax from fees. This is true of Square, Toast, PayPal, and every other processor. Tax flows: diner pays it, Stripe processes it, lands in restaurant's account, restaurant remits to PA quarterly.

**Why one charge instead of two (v5.2 change).** v5.1 captured food at departure and fired a second off-session PaymentIntent for the tip five minutes later. That paid Stripe's $0.30 flat fee twice, costing the server roughly $0.25 per tab. v5.2 holds capture until the diner either picks a tip or the 15-minute timeout applies the 20% default, then fires one combined charge. See `docs/prd/02-payments-and-money.md` for the full flow.

### Platform Summary

| | Restaurant | Diner (Account) | Diner (Guest) |
|---|---|---|---|
| Cost | $0 | $0 | 0.5% service fee |
| Hardware | BYOD | Any phone | Any phone |
| App required | No (web) | No (PWA) | No (web) |
| Payment action at table | Never | Never | One tap on arrival |
| Payment action on leaving | Zero | Zero | One tap |

### Why This Works (Numbers from pitch research, not acceptance criteria)

- **Turn time drops ~21%.** Removing the check-dance compresses casual-dining turn time from ~70 min to ~55 min. On a 20-table restaurant with a $35 avg check, one extra turn per table on a peak shift is ~$700 incremental revenue.
- **Avg check size rises 8–20%.** Self-ordering diners browse more and linger on photos.
- **Checkout friction drops from 9–15 min to <1 min.**
- **Order errors drop ~25%; tips increase up to 16%.** Direct-to-KDS removes the write-down-and-relay error source.

These are design rationale, not targets the engineering team must verify.

---

## 2. Competitive Analysis — The Toast Replacement Pitch

### Costs

| Cost | Toast | WalkOut |
|---|---|---|
| Software (starter) | $0/mo | $0/mo |
| Software (POS) | $69/mo | $0/mo |
| Software (build your own) | $165/mo | $0/mo |
| Starter kit hardware | $627+ | $0 (BYOD) |
| Processing rate | 2.99% + $0.15 | 2.9% + $0.30 (standard Stripe) |
| Long-term contract | Yes (2 yr typical) | No |
| KDS | Separate subscription | Included |

A 40-seat restaurant doing $8,000/week saves ~$472/month switching from Toast to WalkOut.

### What WalkOut Replaces (by version)

| Toast feature | WalkOut equivalent | Version |
|---|---|---|
| POS terminal | RBAC staff dashboard on any tablet | v1 |
| KDS | `/dashboard/kitchen` live tiles | v1 |
| Cash payments | "Pay with Cash" + CloudPRNT receipt + drawer | v1 |
| Card terminals | NFC hold-on-arrival (zero hardware) | v1 |
| Table management | Live table grid | v1 |
| Digital menu | Menu management dashboard | v1 |
| Staff management | RBAC invite system | v1 |
| Service call bell | Service Requests UI (new in v5.0) | v1 |
| Inventory tracking | Delivery log + weekly count | v2 |
| AI purchasing forecast | Gemini-powered weekly PO | v2 |
| Tap-to-Pay terminal | Stripe Terminal SDK on staff phone | v2 |
| Staff comp / discount | Per-item void + percent discount with reason | v2 |
| Ingredient-level tracking | Bill of materials per menu item | v3 |

### 30-Second Pitch

"You pay Toast $165 a month plus buy $600 of hardware that breaks. With WalkOut, the software is free, you use the iPad you already have, and your customers pay a 0.5% service fee. On a $50 check that's 25 cents. Your processing rate doesn't change. You save $200+ a month from day one."

### Hardware Buy-Back Program (GTM only — affects onboarding, not the platform)

WalkOut offers Toast-fleet migrations a cash buy-back of their existing Toast hardware at a percentage of book value, applied to the restaurant's first three months of processing. Mechanically, this is a marketing promotion; it has no engineering surface.

---

## 3. User Personas & RBAC Model

Four identity tiers:

- **Restaurant ADMIN** — Restaurant record. Owns the tenant. Configures Stripe Connect, invites staff, sets tax rate, and can do anything a MANAGER can.
- **MANAGER** — Elevated staff. Floor setup, tip pool distribution, staff invites, analytics.
- **STAFF** — Floor/kitchen. Can view tables, advance KDS tiles, acknowledge service requests, collect cash, trigger "Table Cleared." Cannot access financial admin.
- **DINER** — Optional account holder. Gets the zero-friction experience with saved card + tip preference.
- **Guest** — Anonymous. `tabs_anon` httpOnly cookie. Taps NFC, enters name, pays like any diner but account is ephemeral.

Plus:
- **The Group Host** — First to tap NFC at a table. Opens the tab. Can pay for the whole table. Sees all group orders.
- **The Group Joiner** — Taps NFC after session active. Joins the tab. Orders independently. Pays own share.

Full RBAC spec in `docs/prd/03-auth-staff-rbac.md`.

---

## 4. PokerPay → WalkOut Conceptual Mapping

WalkOut forks `ByteMasterMike/PokerPay`. The mental-model translation:

| PokerPay | WalkOut | Notes |
|---|---|---|
| PokerTable | DiningTable | Rename. `qrCode` → `nfcTagId`. |
| QR scan to join | NFC tap to join | Remove `@zxing/*`. NFC hardware handles redirect. |
| GameSession | TabSession | Add hold tracking, server assignment, status. |
| Player joins session | TabParticipant joins tab | Same pattern, richer identity model. |
| `Player.chipStack` (number) | `TabParticipant.orders[]` | Array of OrderItem vs. a single number. |
| Manual chip count | Diner browses menu, adds items | New UI, same data relationship. |
| Cash out | Auth hold captured on departure | Core architectural change. |
| Host creates game | Restaurant pre-configures tables | Restaurant is host at the meta level. |
| NextAuth User | Restaurant (ADMIN) + RestaurantStaff + Diner | Three user types. |
| Nightly cron | Combined 5-min cron `/api/cron/maintenance` | One job, three functions. |
| `@zxing` QR scanner | Removed. `qrcode` stays for fallback QR. | Scanner no longer needed. |
| R2 photo storage | R2 (menu item photos) | Same infra, different content. |
| Gemini AI | Menu descriptions + v2 inventory forecasting | Keep dependency, expand use. |
| Twilio | Departure, failure, tip SMS | Retain. |
| Resend | Staff invites, receipts, tip prompts, POs | Retain and expand. |

---

## 5. Core User Flows

### 5.1 Account Holder — Zero-Friction Flow

```
ONE-TIME SETUP (~60 seconds, done forever):
  Create Diner account
  → "Enable instant checkout"
  → Stripe.js renders Apple Pay / Google Pay sheet
  → Face ID / fingerprint authentication
  → SetupIntent saves card on file
  → Set tip preference: 18% / 20% / 22% / Auto-20% / No tip
  → Done

EVERY SUBSEQUENT VISIT (NFC, v1):
  Sit down at table
  → Tap NFC sticker
  → Browser opens: walkoutofficial.com/join/[nfcTagId]
  → App recognises account from session cookie
  → Tab opens, auth hold placed silently ($75 default)
  → Browse menu, add items, eat
  → Ready to leave → three options:

      A) Tap NFC a second time OR visit walkoutofficial.com
         → Tip selector shown with running total
         → Pick 18% / 20% / 22% / Custom / No tip
         → Confirm → ONE combined capture fires immediately

      B) Just walk out (idle-timeout fallback, §11.6)
         → 15-min timer starts when session goes idle
         → Push: "Pick a tip before 20% applies"
         → If no response by 15 min: 20% default, capture fires
         → If diner taps the link during the window: their choice wins

      C) Staff presses "Table Cleared"
         → Table flips to AVAILABLE immediately (seating-state only)
         → Does NOT fire capture
         → Tip-resolution clock continues in background
         → Session surfaces in Pending Settlements (§21.8) if still unresolved

Payment interactions during meal:   0
Payment interactions after meal:    1 optional tap (to pick a non-default tip)
```

### 5.2 Guest Diner Flow

```
Tap NFC → browser opens join page
  → Enter display name
  → Stripe payment sheet: Apple Pay / Google Pay / Card
  → Consent: "A $75 hold appears on your statement.
    You'll only be charged for what you order."
  → SMS disclaimer displayed if phone field completed:
    "Message frequency varies. Reply STOP to opt out."
  → Face ID / fingerprint → SetupIntent saves card for this session
  → Auth hold placed immediately
  → Tab opens, browse menu, order, eat

[Ready to leave:]
  → Tap "Pay & Leave" → same tip window as §5.1, single combined capture
  → Receipt emailed if email provided
  → "Save your details for next time?" → optional account migration (§11.8)
```

### 5.3 Group Flow

```
Host taps NFC → new session, host role assigned, hold on host's card
Joiners tap same sticker (session active)
  → "Join [Host]'s tab at Table 7?" → Yes
  → Each joiner: SetupIntent + hold placed

Departure (each person leaves independently):
  → Account holders: auto-captured on idle/staff clear
  → Guests: tap "Pay & Leave"
  → Session stays open until last participant settled

Host pays for everyone:
  → "Pay for Table" → captures host's hold for full group total
  → Releases all other holds
```

### 5.3.1 Host Leaves Before Group (v5.0)

If host departs while joiners are still seated:
1. Host taps "Pay & Leave" or idle timeout fires on host only.
2. Host's participant captures normally for their portion of orders.
3. Host's `TabParticipant.departedAt` is set, but `TabSession.status` stays `OPEN`.
4. `hostParticipantId` reassigned to the next-joined participant who still has an active hold. That participant gets a push: "You're now the host of Table 7's tab."
5. If no other participants have active holds, session moves to `CLOSING` then `CLOSED`.

"Pay for Table" is only available to the current host.

### 5.4 Cash Diner Flow

```
Diner orders normally via app
  → Taps "Pay with Cash"
  → Auth hold cancelled (no charge needed)
  → OrderItem statuses → CASH_PENDING
  → KDS shows red-bordered CASH_PENDING tile
  → Staff dashboard alert: "Table 7 — cash payment"
  → Staff taps "Print Receipt & Open Drawer"
  → PrintJob queued → printer polls → receipt prints → drawer opens
  → Staff collects cash → taps "Cash Collected"
  → Session closes → table available
```

### 5.5 Pre-Shift Server Assignment

Manager opens `/dashboard/floor` before service, drags tables to servers, saves. When a tab opens on that table, the `assignedStaffId` copies to the session. Full spec in `docs/prd/02-payments-and-money.md` (tip attribution derives from this).

### 5.6 Restaurant Setup

```
Owner registers (email, restaurant name, address)
  → Stripe Connect onboarding (Stripe-hosted, ~5 min)
  → "Set Up Your Tables" — input table names/numbers
  → System generates unique nfcTagId per table
  → Onboarding email: NFC sticker programming instructions, Amazon shopping list
  → Build menu: categories → items → prices → tax rate → photos → allergens
  → Tax settings: PA 6% pre-populated for PA zip codes
  → Tip distribution: DIRECT (default) or POOL
  → Invite staff: email + role
  → Kitchen tablet: log in as KDS account
  → Dashboard live
```

---

## Versioning

This module reflects PRD v5.2 (April 2026). v5.2 supersedes v5.1's two-charge tip model and v5.0's departure-equals-capture conflation. Any code referencing "ASK_AFTER" mode or firing capture on "Table Cleared" is out of date.
