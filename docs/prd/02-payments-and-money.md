# PRD Module 02 — Payments & Money

Covers PRD sections 11 (Payment Architecture), 12 (Sales Tax), 13 (Monetization), 17 (Tip Assignment & Distribution), 18 (Tip Prompt), Appendix D (Payment Decision Tree), Appendix E (Money Flow Summary).

**This is the most important module.** Every code path here moves real money. Read this before writing one line of payment code.

**Required reading order**: `00-overview.md` → this module → `01-architecture-schema.md` (for the schema fields you'll touch).

---

## 11. Payment Architecture

### 11.1 State Machine

```
Diner taps NFC → SetupIntent → off-session PaymentMethod saved
                                           │
                                           ▼
                                Create PaymentIntent (hold)
                                  capture_method: 'manual'
                                  amount: defaultHoldAmount (100)
                                  application_fee_amount: 0   ← NO fee on hold
                                  on_behalf_of: restaurant.stripeConnectAccountId
                                  idempotency: hold-{pid}-{holdAttempt}
                                           │
                      ┌────────────────────┼────────────────────┐
                      ▼                    ▼                    ▼
              requires_action          succeeded            failed / declined
              (3DS modal)              (HELD)                (FAILED)
                                                             Block menu access
                                                             "Card declined"
                                           │
                                           ▼
                                Order food, eat
                                           │
                                           ▼
              Departure trigger (diner action OR idle timeout OR UWB exit)
                                           │
                                           ▼
                              Session → AWAITING_TIP
                              awaitingTipSince = now()
                              Push notification fires
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
              Diner picks tip       Diner taps "No tip"    15 min elapse
              resolvedTipAmount=n   resolvedTipAmount=0    resolvedTipAmount=
              source=DINER_CHOICE   source=DINER_DECLINED    subtotal × 0.20
                                                            source=TIMEOUT_DEFAULT
                    └──────────────────────┼──────────────────────┘
                                           ▼
                          Compare-and-swap captureStatus:
                          PENDING → CAPTURING (§18.6)
                                           │
                                           ▼
                              ONE combined capture fires
                              See §11.4 for formula
                              See §11.5 for overflow
                                           │
                                           ▼
                        Webhook: payment_intent.succeeded
                          captureStatus = CAPTURED
                          Write feeAllocatedTo* (§17.8)
                          Attribute tip (§17.4)
```

The critical v5.2 change: **capture does not fire on departure**. It fires on tip resolution. This lets a single combined charge absorb both food and tip, avoiding a double $0.30 flat fee.

"Table Cleared" is intentionally absent from this diagram. It is seating-state only (see §11.6).

### 11.2 SetupIntent

```typescript
const setupIntent = await stripe.setupIntents.create({
  customer:           stripeCustomerId,
  usage:              'off_session',
  payment_method_types: ['card'],
  payment_method_options: {
    card: { request_three_d_secure: 'any' }
    // Force 3DS during setup so the bank grants exemption for future off-session captures
  },
  metadata: { sessionId, participantId, restaurantId },
})
```

### 11.3 Authorization Hold

```typescript
// IMPORTANT: pre-increment participant.holdAttempt BEFORE this call
participant.holdAttempt += 1
await prisma.tabParticipant.update({ where: { id: participant.id }, data: { holdAttempt: participant.holdAttempt }})

const paymentIntent = await stripe.paymentIntents.create({
  amount:                 restaurant.defaultHoldAmount,   // 100 = $1.00
  currency:               'usd',
  customer:               stripeCustomerId,
  payment_method:         paymentMethodId,
  capture_method:         'manual',
  confirm:                true,
  on_behalf_of:           restaurant.stripeConnectAccountId,
  application_fee_amount: 0,  // No fee on hold. Fee is at capture only.
  metadata:               { sessionId, participantId, type: 'auth_hold' },
}, {
  idempotencyKey: `hold-${participantId}-${participant.holdAttempt}`
})
```

If `status === 'requires_action'`: return `clientSecret` to client, have the client call `stripe.confirmCardPayment()` for the 3DS modal. If declined: `holdStatus = FAILED`. Show "Card declined, try a different card." Block menu access until `HELD`.

### 11.4 Capture Math (Complete Formula)

All intermediate calculations stay in `Decimal`. Conversion to cents happens ONCE at the final Stripe call.

```typescript
import { Decimal } from 'decimal.js'

// 1. Pre-tax food subtotal (from snapshotted OrderItem.unitPrice)
const subtotal = orders
  .filter(o => o.status !== 'CANCELLED')
  .reduce((sum, o) => sum.plus(o.unitPrice.times(o.quantity)), new Decimal(0))

// 2. Sales tax: SUM of snapshotted OrderItem.taxAmount. Never recompute from restaurant.taxRate.
const tax = orders
  .filter(o => o.status !== 'CANCELLED')
  .reduce((sum, o) => sum.plus(o.taxAmount), new Decimal(0))

// 3. WalkOut Service Fee: 0.5% of PRE-TAX food subtotal. NOT on tax. NOT on tip. NOT on service requests.
const serviceFee = subtotal.times(restaurant.walkOutServiceFeePercent)
  .plus(new Decimal(restaurant.walkOutServiceFeeFlat).div(100))
  .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

// 4. Tip is ALWAYS in the capture in v5.2 (no more second PaymentIntent).
//    Value is whichever resolved first: diner choice, "No tip", or 15-min timeout (20%).
const tip = participant.resolvedTipAmount ?? new Decimal(0)

// 5. Total to capture
const total = subtotal.plus(tax).plus(serviceFee).plus(tip)

// 6. Convert to cents ONCE, at the end
const totalCents      = total.times(100).toNumber()
const serviceFeeCents = serviceFee.times(100).toNumber()
const taxCents        = tax.times(100).toNumber()
const subtotalCents   = subtotal.times(100).toNumber()
const tipCents        = tip.times(100).toNumber()

// Stripe Connect application fee = service fee ONLY.
//   Tax belongs to the restaurant (they remit to PA).
//   Tips belong to the restaurant (they distribute to staff).
const applicationFeeCents = serviceFeeCents
```

### 11.5 Capture Execution, Overflow, and Prorated Application Fee (v5.0 fix)

When the bill exceeds the hold, the application fee is split across two PaymentIntents. Use **floor-then-remainder** to guarantee the split sums exactly.

```typescript
participant.captureAttempt += 1  // increment before each attempt
await persist(participant.captureAttempt)

if (totalCents <= holdAmount) {
  // Happy path
  await stripe.paymentIntents.capture(participant.stripePaymentIntentId!, {
    amount_to_capture:      totalCents,
    application_fee_amount: applicationFeeCents,
  }, {
    idempotencyKey: `capture-${participantId}-${participant.captureAttempt}`
  })
} else {
  // Overflow: capture full hold, then off-session charge for remainder
  const holdFeeCents     = Math.floor(applicationFeeCents * holdAmount / totalCents)
  const overflowFeeCents = applicationFeeCents - holdFeeCents   // exact remainder
  const overflowAmount   = totalCents - holdAmount

  await stripe.paymentIntents.capture(participant.stripePaymentIntentId!, {
    amount_to_capture:      holdAmount,
    application_fee_amount: holdFeeCents,
  }, {
    idempotencyKey: `capture-${participantId}-${participant.captureAttempt}`
  })

  participant.overflowAttempt += 1
  await persist(participant.overflowAttempt)
  await stripe.paymentIntents.create({
    amount:                 overflowAmount,
    currency:               'usd',
    customer:               participant.stripeCustomerId!,
    payment_method:         participant.stripePaymentMethodId!,
    confirm:                true,
    off_session:            true,
    on_behalf_of:           restaurant.stripeConnectAccountId,
    application_fee_amount: overflowFeeCents,
    metadata:               { participantId, type: 'overflow' },
  }, {
    idempotencyKey: `overflow-${participantId}-${participant.overflowAttempt}`
  })
}
```

**CRITICAL**: `Math.round()` on both halves can sum to one cent more than `applicationFeeCents`. Do not use round.

### 11.6 Departure Detection (v5.2, Two Independent State Machines)

v5.2 splits what v5.0 treated as one state into two.

**(A) Table seating state** — governs when the table is physically available for a new party. Controlled by staff. Values: `AVAILABLE → OCCUPIED → CLOSING → AVAILABLE`.

**(B) Session payment state** — governs when the diner's money moves. Controlled by diner action, proximity, cron. Values: `OPEN → AWAITING_TIP → CAPTURING → CAPTURED | FAILED`.

The two are coupled only at session creation (opening flips table to `OCCUPIED`). After that they are independent. Staff can clear the table before payment resolves; payment can resolve before the table is cleared; neither blocks the other.

**Seating-state triggers**

- **Staff "Table Cleared"**: `POST /api/restaurant/sessions/[id]/clear` flips the table to AVAILABLE, sets `session.seatingClearedAt`. **Does NOT fire capture.** Any session in `AWAITING_TIP` continues its countdown and surfaces in Pending Settlements (§21.8).

**Payment-state triggers (each one moves `OPEN → AWAITING_TIP` and starts the 15-minute tip window)**

- **NFC second tap**: diner taps sticker again, resolves to `/tab/[sessionId]` in checkout mode.
- **Diner self-checkout**: `POST /api/sessions/[sessionId]/checkout`.
- **UWB geofence exit (v2)**: native app detects presence loss.
- **Idle timeout**: `lastHeartbeatAt < now - idleTimeoutMinutes`. Diner gets push with tip selector link.
- **2-hour safety net**: `cleanupSessions()` force-escalates any still-OPEN session after 2 hours into `AWAITING_TIP`.

**What fires capture**

- Diner's explicit tip choice (percentage, custom, or "No tip") — capture fires within seconds.
- 15-minute timeout — cron fires capture with 20% default.

**What does NOT fire capture**

- Staff "Table Cleared".
- Opening the tip link without a choice.
- Any floor-dashboard action other than explicit resolution in Pending Settlements.

**Cron (`processDepartures()`, every 5 minutes, two passes)**

1. Move sessions `OPEN → AWAITING_TIP` when idle-timeout or 2h threshold is crossed.
2. Move sessions `AWAITING_TIP → CAPTURING` when `awaitingTipSince + 15min < now`, using 20% default.

**Client heartbeat** (30 seconds, unchanged from v5.0):

```typescript
useEffect(() => {
  const ping = () => fetch(`/api/sessions/${sessionId}/heartbeat`, {
    method: 'POST',
    body: JSON.stringify({ participantId }),
  })
  ping()
  const interval = setInterval(ping, 30_000)
  return () => clearInterval(interval)
}, [sessionId, participantId])
```

**Idle warning toast at 10 minutes**:

```
⏱ Your tab at Brew & Blade goes into checkout in 5 minutes.
After that, a 20% tip applies automatically unless you choose otherwise.
[I'm still here]    [Leave & pay now]
```

### 11.7 Hold Re-authorization

Stripe auth holds expire in ~7 days on credit cards, 1–2 days on debit. Long-running tabs need refresh.

**Trigger**: `cleanupSessions()` selects participants where:
- `holdStatus = HELD`
- `captureStatus = PENDING`
- `reauthCount < 3` (cap at 3 to avoid infinite retries)
- `createdAt < now - (6.5 days for credit | 1.5 days for debit)`

**Flow**

1. `holdStatus = REAUTHORIZING`.
2. Create a new off-session PaymentIntent against the same PaymentMethod with `idempotency_key: reauth-${participantId}-${reauthCount + 1}` and `metadata.type: 'reauth'`.
3. If succeeds: cancel old PaymentIntent (`stripe.paymentIntents.cancel(oldId)`), update `stripePaymentIntentId`, set `holdStatus = HELD`, increment `reauthCount`.
4. If fails: `holdStatus = EXPIRED`, urgent push + email + SMS to diner, flag on dashboard. **Do NOT auto-capture an expired hold without human review.**

### 11.8 Guest → Account Migration

After capture, guest diners see "Save your details for next time?". Tapping performs a single-transaction migration:

```typescript
async function migrateGuestToDiner({
  participantId, email, password, name, anonToken
}: MigrateInput): Promise<Diner> {
  return prisma.$transaction(async (tx) => {
    const participant = await tx.tabParticipant.findUnique({
      where: { id: participantId },
      include: { session: true }
    })

    // CRITICAL: the caller's anonToken cookie must match the participant.
    if (!participant || participant.anonToken !== anonToken) {
      throw new Error('Unauthorized')
    }
    if (!participant.stripeCustomerId) {
      throw new Error('No Stripe customer on participant')
    }

    // Reuse existing Stripe Customer. Do NOT create a new one.
    // The existing Customer has the PaymentMethod attached from the guest SetupIntent.
    const diner = await tx.diner.create({
      data: {
        email,
        name,
        passwordHash:                 await bcrypt.hash(password, 12),
        stripeCustomerId:             participant.stripeCustomerId,
        stripeDefaultPaymentMethodId: participant.stripePaymentMethodId,
        autoChargeEnabled:            true,
        defaultTipBehavior:           'ASK',
      }
    })

    await tx.tabParticipant.update({
      where: { id: participantId },
      data:  { dinerId: diner.id, anonToken: null }
    })

    const anon = await tx.anonSession.findFirst({ where: { token: anonToken } })
    if (anon) {
      await tx.anonSession.update({
        where: { id: anon.id },
        data:  { mergedInto: diner.id }
      })
    }

    return diner
  })
}
```

### 11.9 Failure Flows

**Hold declined**: Show "Card declined, try a different card." Block menu access.

**Capture fails**:
```
captureStatus = FAILED
→ Push + Resend email + Twilio SMS (all three, urgent):
   "We couldn't charge $36.74 at [Restaurant]. Pay here: [link]"
→ Restaurant dashboard alert (Pending Settlements §21.8)
→ 48h reminder → 96h write-off (restaurant bears risk, see Decisions log)
```

---

## 12. Sales Tax Architecture

### 12.1 Rules (restate from §7.2)

- Tax is calculated on pre-tax food subtotal only.
- Tax rate is restaurant-configurable, stored on `Restaurant.taxRate` (Decimal 5,4).
- `taxRate` and `taxAmount` are **snapshotted on `OrderItem` at creation**.
- Mid-session rate changes do not affect existing orders.
- Stripe processes the full amount including tax. Restaurant receives tax on pass-through basis, remits to PA quarterly.

### 12.2 At Order Creation

```typescript
const menuItem = await prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } })
const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } })

const unitPrice = new Decimal(menuItem.price)
const taxRate   = restaurant.taxEnabled ? new Decimal(restaurant.taxRate) : new Decimal(0)
const taxAmount = unitPrice.times(taxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

await prisma.orderItem.create({
  data: {
    sessionId,
    participantId,
    menuItemId: menuItem.id,
    quantity,
    unitPrice,
    taxRate,
    taxAmount,
    notes,
  }
})
```

### 12.3 At Capture

Sum `OrderItem.taxAmount` (already snapshotted, per-line, for exact rows not cancelled). Never recompute from `restaurant.taxRate`. The already-snapshotted values are the legal record.

### 12.4 Tax Rate Change Mid-Session

If the restaurant updates `taxRate` while sessions are open:
- Existing `OrderItem` rows keep their snapshotted rate.
- New orders use the new rate.
- Settings UI must communicate: "Tax rate change affects new orders only."

### 12.5 Quarterly Tax Report

Analytics page generates CSV from immutable snapshots:

```csv
date,sessions,food_subtotal_usd,tax_collected_usd,tax_rate
2026-04-08,34,2840.00,170.40,0.06
2026-04-09,28,2210.50,132.63,0.06
```

Under no circumstances recompute tax from `restaurant.taxRate` at report time — that gives wrong numbers if the rate ever changed.

### 12.6 Receipt Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           BREW & BLADE
     214 County Line Rd, Warminster PA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Table 7  ·  Wed Apr 8, 2026
Server: Alex Chen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2x Cheeseburger              $28.00
1x Caesar Salad               $6.50
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subtotal:                    $34.50
PA Sales Tax (6%):            $2.07
WalkOut Service Fee:          $0.17
Tip:                          $6.90
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total charged:               $43.64
Visa ending 4242
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

(v5.2 format: tip is on the receipt because it's in the single charge, not "charged separately".)

Service requests do not appear on the receipt.

---

## 13. Monetization Model

- Restaurant pays: 2.9% + $0.30 to Stripe (identical to Square).
- Diner pays: food + tax + 0.5% WalkOut Service Fee (on pre-tax food only) + tip.

Example on $50 meal:
- WalkOut gross: $0.25
- Stripe fees on $63.25 (with 20% tip): $2.14
- WalkOut net after pro-rata fee share: $0.24
- Restaurant food net: $48.31
- Server tip net: $9.66 (direct mode, fee share deducted)

```typescript
// Stripe Connect application fee
application_fee_amount: serviceFeeCents  // WalkOut's 0.5% of pre-tax food subtotal
// Deducted by Stripe before funds hit restaurant's Connect account.
// Restaurant receives remainder (food + tax + tips).
// WalkOut never touches or holds restaurant funds.
```

Consumer-facing copy (always visible before charge confirmation):
```
WalkOut Service Fee:  $0.25
  Enables contact-free walk-out checkout
```

---

## 17. Tip Assignment & Distribution

### 17.1 Server Assignment to Tips

When a `TabSession` opens, it copies the active `TableAssignment.staffId` to `session.assignedStaffId`. When capture fires, `tipAssignedToStaffId` is set from `session.assignedStaffId`. No server assigned = tip goes to Unattributed. Dashboard warns on any unassigned active table.

### 17.2 Two Distribution Modes

**DIRECT (default)**: each server keeps tips from their tables. Analytics shows per-server totals. Restaurant distributes via payroll or end-of-shift cash.

**POOL**: all tips during a shift period go into a `TipPool`. Manager closes the pool at end of shift, sees the total, distributes per their internal policy. WalkOut tracks contribution, does not dictate the split.

### 17.3 Tip Pool Legal Disclaimer (FLSA)

Shown when POOL mode is enabled. Logged with timestamp (`tipPoolDisclaimerAt`):

```
⚠️ Tip Pool Legal Notice
Under the federal Fair Labor Standards Act (as amended 2018):

- If you pay all staff full minimum wage (no tip credit): you may
  include back-of-house staff in tip pools.
- If you take a tip credit for tipped employees: tip pools may
  only include front-of-house staff.
- Employers may NEVER retain any portion of tips.

WalkOut tracks and reports tip amounts only.
Distribution is your legal responsibility.
```

### 17.4 Tip Attribution at Capture (concurrency-safe)

Two simultaneous first tips of a shift must not create two pools. Mitigation: partial unique index + `findFirst → create with catch-P2002 → refetch` pattern.

```typescript
const session = await prisma.tabSession.findUnique({
  where:   { id: participant.sessionId },
  include: { restaurant: true }
})

const tipData = {
  tipAssignedToStaffId: session.assignedStaffId ?? null,
  tipPoolId:            null as string | null,
}

if (session.restaurant.tipDistributionMode === 'POOL' && tipAmountCents > 0) {
  // Find or create the OPEN pool for this restaurant.
  // Partial unique index `one_open_pool_per_restaurant` guarantees uniqueness.
  let pool = await prisma.tipPool.findFirst({
    where: { restaurantId: session.restaurantId, status: 'OPEN' }
  })
  if (!pool) {
    try {
      pool = await prisma.tipPool.create({
        data: { restaurantId: session.restaurantId, status: 'OPEN', shiftDate: new Date() }
      })
    } catch (e: any) {
      if (e.code !== 'P2002') throw e
      // Lost the race. Re-fetch.
      pool = await prisma.tipPool.findFirstOrThrow({
        where: { restaurantId: session.restaurantId, status: 'OPEN' }
      })
    }
  }

  tipData.tipPoolId = pool.id

  await prisma.$transaction([
    prisma.tipPoolEntry.create({
      data: {
        poolId:        pool.id,
        participantId: participant.id,
        staffId:       session.assignedStaffId,
        amountCents:   tipAmountCents,
      }
    }),
    prisma.tipPool.update({
      where: { id: pool.id },
      data:  { totalAmountCents: { increment: tipAmountCents } }
    })
  ])
}

await prisma.tabParticipant.update({
  where: { id: participant.id },
  data:  { ...tipData, tipStatus: 'RESOLVED', resolvedTipAmount: tipAmountCents }
})
```

### 17.5 v1 Money Flow for Tips

Tips land in the restaurant's Stripe Connect account. WalkOut tracks attribution only. Restaurants distribute via payroll or cash. Direct-to-server bank payouts (Stripe Express) are v2 — require SSN + bank account + 1099-K compliance.

### 17.6 Floor Setup (`/dashboard/floor`)

- **Who**: MANAGER and ADMIN. STAFF cannot view or edit.
- **When**: start of each shift. Drag table chips onto staff rows. ~30 seconds.
- **Persistence**: writes `TableAssignment` rows per `(tableId, shiftDate)`, replacing prior assignments for that shift (no duplicates).
- **"Load Yesterday's Setup"**: clones the previous shift's assignments.
- **Interaction with open sessions**: §17.1 copy-on-open is not retroactive. Floor plan edits do not re-attribute already-open sessions (tips don't jump between servers mid-meal).
- **Unassigned tables**: yellow banner; any tip on an unassigned session lands in "Unattributed".

### 17.7 Tip Analytics

DIRECT mode shows per-server gross/fee/net columns (see §17.9 format). POOL mode shows pool total, open/close/distribute actions.

### 17.8 Pro-Rata Fee Allocation (v5.2, NEW)

v5.1 two-charge model had independent fees per PaymentIntent. v5.2 combined charge means one blended Stripe fee, so the fee is split back out pro-rata.

**Rule**: Stripe's fee is allocated to each component in proportion to that component's share of the total charge.

```
For charge of total_cents and Stripe fee stripe_fee_cents,
for component C (food, tax, service fee, tip):
  C_share = round_banker( C_cents / total_cents × stripe_fee_cents )

Rounding remainder assigned to food subtotal (largest component)
to guarantee sum(shares) == stripe_fee_cents exactly.
```

**Worked example ($50 meal + 20% default tip, Warminster PA)**

```
Charge breakdown:
  subtotal (food)    $50.00    79.05%
  tax                 $3.00     4.74%
  service fee         $0.25     0.40%
  tip (20%)          $10.00    15.81%
  ─────────────────────────────────
  total              $63.25   100.00%

Stripe processing on $63.25 = $2.14 (2.9% × $63.25 + $0.30)

Fee allocated to each:
  food:              $1.69   (79.05% × $2.14)
  tax:               $0.10   ( 4.74% × $2.14)
  service fee:       $0.01   ( 0.40% × $2.14)
  tip:               $0.34   (15.81% × $2.14)

Net to each party:
  Server (tip net)        $9.66  ($10.00 − $0.34)
  Restaurant food net    $48.31  ($50.00 − $1.69)
  Restaurant tax pass     $2.90  ($3.00  − $0.10, remitted quarterly)
  WalkOut service fee     $0.24  ($0.25  − $0.01)
```

**Where computed**: in the Stripe webhook handler for `payment_intent.succeeded`, after Stripe returns the actual `application_fee_amount` and net. Written to `TabParticipant.feeAllocatedTo*Cents` (see schema). Reproducible from the charge — not an additional charge.

**Why the tip's share matters**: in DIRECT mode, server's reported tip = `resolvedTipAmount − feeAllocatedToTipCents`. Restaurant distributes net.

**FLSA lawfulness**: US DoL permits restaurants to deduct pro-rata share of credit card processing fees from tips (FLSA2006-11NA) provided deduction does not drop employee below minimum wage and is not arbitrary. The `(tip / total) × total_fee` formula is the canonical "fair share" interpretation.

**Absorb-fee mode**: if `restaurant.absorbTipProcessingFee = true`, the server receives the gross tip, `feeAllocatedToTipCents` is still recorded for reporting, restaurant's food net absorbs the additional cost.

### 17.9 Tip Report Format

```
Tip Report — Wednesday, April 8        [Direct Mode]
─────────────────────────────────────────────────────
                    Gross      Fee       Net
  Alex Chen       $87.40    −$3.00    $84.40   (12 sessions)
  Maria Lopez     $64.20    −$2.20    $62.00   (9 sessions)
  James Wu        $42.80    −$1.47    $41.33   (7 sessions)
  Unattributed     $6.90    −$0.24     $6.66   (1 session)
─────────────────────────────────────────────────────
  Totals        $201.30    −$6.91   $194.39
```

Under `absorbTipProcessingFee = true`, Fee/Net columns hidden; Gross column labeled "Tips."

---

## 18. Tip Prompt Architecture

### 18.1 US Tip Culture

Suggested amounts for US restaurants: 18% / 20% / 22% of pre-tax subtotal. Not 10% / 15% (UK norms). Calculated on pre-tax food subtotal only — not on tax, not on service fee.

### 18.2 The v5.2 Model: One Combined Charge

Single combined capture after tip is resolved. Tip states covered by `TipBehavior` (`ASK`, `AUTO_18`, `AUTO_20`, `AUTO_22`, `AUTO_NONE`) and `TipSource` (`DINER_CHOICE`, `DINER_DECLINED`, `TIMEOUT_DEFAULT`, `AUTO_PREF`). Flow diagram in §11.1.

### 18.3 20% Default and Diner Disclosure

When session moves to `AWAITING_TIP`, the tip selector screen displays:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        Brew & Blade ☕
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Your meal:          $53.25
  Subtotal:           $50.00
  Tax + fee:           $3.25

  Add a tip:
   ○ 18% ($9.00)
   ● 20% ($10.00)    ← default if you don't pick
   ○ 22% ($11.00)
   ○ Custom
   ○ No tip

  ⏱ 14:47 remaining
  A 20% tip will be applied if you don't choose.

  [ Confirm tip & pay ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The countdown and the disclosure copy are both mandatory. They convert a surprise default into an informed default.

### 18.4 AUTO_* Preferences

Account holders can set `defaultTipBehavior` to `AUTO_18`, `AUTO_20`, `AUTO_22`, or `AUTO_NONE`. If set to any AUTO_* value:

- No push notification fires.
- Cron fires capture at the 15-minute timeout with the preferred percentage.
- `resolvedTipSource = AUTO_PREF`.

If set to `ASK` (the default): push notification fires at `AWAITING_TIP`, 20% default at timeout.

### 18.5 TipToken Security

Every tip selector link is signed:

```typescript
// Signing (server-side, when push fires)
const tipToken = jwt.sign({
  participantId,
  subtotalCents,
  maxTipCents: Math.floor(subtotalCents * 0.5),   // cap at 50%
  expiresAt:   Date.now() + 24 * 60 * 60 * 1000,  // 24h
}, process.env.TIP_SECRET!, { algorithm: 'HS256' })

// Verification (server-side, when diner taps link)
const claims = jwt.verify(tipToken, process.env.TIP_SECRET!, { algorithms: ['HS256'] })
if (claims.expiresAt < Date.now()) throw new Error('Token expired')
if (requestedTipCents > claims.maxTipCents) throw new Error('Tip exceeds cap')
```

Server verifies signature AND expiry AND cap before any capture. All three, not just one.

### 18.6 Idempotent Capture Compare-and-Swap

Multiple triggers can resolve a tip nearly simultaneously (diner taps tip at the 14:59 mark while cron evaluates at 15:00). Only one capture must fire.

```typescript
// Atomic compare-and-swap in Prisma
const updated = await prisma.tabParticipant.updateMany({
  where: { id: participantId, captureStatus: 'PENDING' },
  data:  { captureStatus: 'CAPTURING' }
})

if (updated.count === 0) {
  // Another path already captured. Exit silently.
  return
}

// ... proceed with capture ...
```

The `updateMany` returns `count` which tells you whether your write won the race.

### 18.7 Receipt After Capture

The receipt (push + email) shows food + tax + service fee + tip as a single combined charge. No "tip charged separately" language (that was v5.1).

---

## Appendix D: Complete Payment Flow Decision Tree (v5.2)

```
                  Diner taps NFC
                         │
                         ▼
             Session OPEN · hold placed
             captureStatus = PENDING
                         │
                ┌────────┴────────┐
                │                 │
                ▼                 ▼
           Eats & orders      Hold re-auth
                               (if > 6.5 days)
                │                 │
                │                 └─► succeeded: refresh hold, continue
                │                     failed: holdStatus = EXPIRED, flag
                │
                ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Any of these move session OPEN → AWAITING_TIP:          │
  │    • Diner NFC second tap                                │
  │    • Diner self-checkout                                 │
  │    • UWB geofence exit (v2)                              │
  │    • Idle timeout via cron                               │
  │    • 2-hour safety timeout                               │
  │                                                          │
  │  (Staff "Table Cleared" is NOT a departure signal.       │
  │   It flips table to AVAILABLE and does nothing else.)    │
  └──────────────────────────────────────────────────────────┘
                         │
                         ▼
            Session: AWAITING_TIP
            awaitingTipSince = now()
            Push: "Pick a tip before 20% applies"
                         │
       ┌─────────────────┼─────────────────┬─────────────────┐
       ▼                 ▼                 ▼                 ▼
  Diner picks       Diner taps        15 min elapse     AUTO_* override
  18/20/22/custom   "No tip"          (cron detects)    (resolvedTipAmount
  resolvedTip =     resolvedTip = 0   resolvedTip =     = preset per
    chosen          source = DINER_   subtotal × 20%     TipBehavior)
  source =          DECLINED          source = TIMEOUT_ source = AUTO_PREF
  DINER_CHOICE                        DEFAULT
       └─────────────────┴─────────────────┴─────────────────┘
                                │
                                ▼
             Compare-and-swap captureStatus:
             PENDING → CAPTURING (§18.6)
             (second write exits — one capture fires)
                                │
                                ▼
             Compute one total in Decimal (§11.4):
                subtotal   = Σ(unitPrice × quantity) from OrderItem snapshots
                tax        = Σ(taxAmount)            from OrderItem snapshots
                serviceFee = subtotal × 0.005
                tip        = resolvedTipAmount
                total      = subtotal + tax + serviceFee + tip
                appFee     = serviceFee only (not tax, tip, or service requests)
                                │
   ┌────────────────────────────┴────────────────────────────┐
   │ total ≤ hold                                             │ total > hold
   ▼                                                          ▼
 capture(total)                                           capture(holdAmount)
  amount_to_capture      = totalCents                       amount_to_capture = holdAmount
  application_fee_amount = appFee                           application_fee_amount =
                                                                floor(appFee × holdAmount / total)
 release excess automatically                             +
                                                          off_session(total - holdAmount)
                                                             application_fee_amount =
                                                                appFee - floor(...)
                                                          (sums exactly to appFee)
   │                                                          │
   └──────────────────────────┬───────────────────────────────┘
                              │
                              ▼
          Webhook: payment_intent.succeeded
            captureStatus = CAPTURED
            holdStatus    = RELEASED
            Write to TabParticipant:
              subtotalCents, taxCents, serviceFeeCents, resolvedTipAmount
              feeAllocatedToFoodCents
              feeAllocatedToTipCents
              feeAllocatedToServiceFeeCents
              feeAllocatedToTaxCents     ← pro-rata §17.8
            Send receipt (push + email)
            Tip attribution:
              DIRECT: tipAssignedToStaffId = session.assignedStaffId
              POOL:   upsert pool, create TipPoolEntry, increment total
                              │
                              ▼
                  Session: CAPTURED · settlement complete

  ─────────────────────────────────────────────────────
  FAILURE BRANCH (any point after capture fires):

  Webhook: payment_intent.payment_failed
    captureStatus = CAPTURE_FAILED
    Session moves to Pending Settlements panel (§21.8)
    Manager sees it with Retry / Contact / Write Off actions
  ─────────────────────────────────────────────────────
```

---

## Appendix E: Money Flow Summary Table

**Canonical $50 meal + 20% default tip, Warminster PA, v5.2 combined capture:**

| Party                         | Amount      | Source                                               | Notes |
|-------------------------------|-------------|------------------------------------------------------|-------|
| Diner pays total              | $63.25      | ONE combined charge                                  | food $50 + tax $3 + fee $0.25 + tip $10 |
| Stripe fees                   | $2.14       | 2.9% × $63.25 + $0.30 (one flat fee)                 | vs. $2.43 under v5.1 two-charge |
| WalkOut receives              | $0.24       | application_fee on capture, net of fee share         | $0.25 gross − $0.01 |
| Pennsylvania (tax)            | $2.90       | Via restaurant remittance                            | $3.00 gross − $0.10, quarterly |
| Restaurant food net           | $48.31      | $50 food − $1.69 Stripe fee share                    | Restaurant's actual income |
| Alex (server, tip net)        | $9.66       | $10 tip − $0.34 Stripe fee share (§17.8 pro-rata)    | Restaurant distributes via payroll |
| **Verified total**            | **$63.25**  | $2.14 + $0.24 + $2.90 + $48.31 + $9.66 ✓             | |

**Under absorb-fee policy** (`absorbTipProcessingFee = true`):

| Party | Amount | Notes |
|---|---|---|
| Alex (server, tip net) | $10.00 | Full gross, no fee share deducted |
| Restaurant food net | $47.97 | $50 food − $1.69 food fee − $0.34 absorbed tip fee |

All other line items (diner, WalkOut, Stripe, PA) are identical.

**What changed from v5.1**: single flat fee ($2.14 vs $2.43), saves $0.29 per tab. Under pro-rata, server net rises from $9.41 (v5.1) to $9.66 (v5.2) on this example.

---

## Test invariants (every money change must pass)

1. Four `feeAllocatedTo*Cents` sum EXACTLY to Stripe's fee (no rounding drift).
2. Overflow capture: `holdFeeCents + overflowFeeCents === applicationFeeCents` (floor-then-remainder).
3. Canonical $50 + $10 case: amounts match Appendix E to the cent.
4. "Table Cleared" does not call `stripe.paymentIntents.capture()`.
5. Capture only fires when `captureStatus` transitions `PENDING → CAPTURING` via the `updateMany` compare-and-swap.
6. Idempotency keys include the attempt counter, always incremented BEFORE the Stripe call.
7. Tax at capture is sum of `OrderItem.taxAmount`, never recomputed from `restaurant.taxRate`.
8. TipToken verification fails if signature invalid OR expired OR requested > `maxTipCents`.

These eight invariants live as unit tests. See `.cursor/agents/tdd-guide.md` for the test patterns.
