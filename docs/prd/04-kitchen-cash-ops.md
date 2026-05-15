# PRD Module 04 — Kitchen, Cash & Service Requests

Covers PRD sections 15 (KDS), 16 (Cash Management & CloudPRNT), 23 (Service Requests).

**Required reading**: `00-overview.md`, `01-architecture-schema.md`. Also `02-payments-and-money.md` for the cash flow's interaction with the hold lifecycle.

---

## 15. Kitchen Display System (KDS)

### 15.1 Route & Access

- Path: `/dashboard/kitchen`
- Accessible to: ADMIN, MANAGER, STAFF
- Device model: **permanently-authenticated shared tablet**. No per-staff logins. No role switching. One `RestaurantStaff` record with `isKdsDevice = true` backs the tablet, and it stays signed in.
- Full-screen. The browser's address bar and tabs should not be visible during service — guide restaurants to use fullscreen / kiosk mode.

**Scope (v5.0)**: KDS shows **food orders only**. Service requests do not appear here. A glass of water is not a kitchen task; surfacing it here would dilute what the line cooks are tracking.

### 15.2 Tile Display

```
┌──────────────────────────────────┐
│ TABLE 7             0:03:24      │  ← table + elapsed time
│ ────────────────────────────     │
│ 2x Cheeseburger                  │
│ 1x Caesar Salad                  │
│ ────────────────────────────     │
│ ⚠ no onions · allergy: nuts      │  ← v5.0: item notes + participant dietary
│                                  │
│          [ PREPPING ]            │  ← tap to advance status
└──────────────────────────────────┘
```

Notes on each tile combine:
- Per-item `OrderItem.notes` (from the diner's "Notes for the kitchen" field on the item detail modal).
- Participant-level `TabParticipant.dietaryNotes`, prefixed with "⚠" in red.

Both come pre-fetched with the order; no second round-trip.

**Color coding**:
- 🟡 Yellow: PENDING (just placed)
- 🟠 Orange: PREPPING (kitchen working)
- 🟢 Green: SERVED (delivered — fades after 60 seconds)
- 🔴 Red border: CASH_PENDING (cash diner, needs floor staff attention)
- ⚫ Gray: CANCELLED

**Elapsed time color**:
- 0–5 min: neutral gray
- 5–10 min: amber
- 10+ min: red

Tap tile → advances one status step (PENDING → PREPPING → SERVED). Single tap, no confirmation dialog. Speed matters during service.

### 15.3 KDS Security Actions (v5.0)

- Status advancement: single-tap, no PIN.
- **Destructive actions** (cancel an item, 86 an item from the menu): require `kdsDevicePin` if set on the KDS staff account. PIN stored bcrypt. If not set, these actions work normally. PIN is an opt-in hardening step, not a blocker for basic operation.

Rate limit on PIN verification: 5 attempts per 15 minutes per staff record. After 5 failures, PIN is locked for 15 minutes and ADMIN is notified.

### 15.4 KDS Real-Time

- Subscribes to `/api/restaurant/stream` (Edge runtime, Supabase Realtime).
- Filter on `order_items` where `restaurant_id === authenticated restaurantId`.
- **Explicitly ignores `service_request` events.** Client-side filter, not server-side — simpler to evolve.
- Re-renders the tile grid on any order status change (debounced to 250ms to avoid flicker during bursts).

### 15.5 What the KDS Does NOT Have

- No role switching. No login screen for individual cooks.
- No per-item price display. Cooks don't care about price; showing it creates visual noise.
- No tip or payment information. That lives on the floor dashboard.
- No service requests. See §23.
- No modifier editor. v5.0 uses free-text item notes; modifier groups are a v2 item.

---

## 16. Cash Management & CloudPRNT Printing

### 16.1 CloudPRNT Architecture (Critical)

You cannot push print jobs from a browser or Next.js server directly to a receipt printer. Star Micronics CloudPRNT works in **reverse**: the printer polls your server every ~5 seconds. Your server returns the next queued job. The printer executes it and calls back to confirm.

The cash drawer opens automatically because it plugs into the printer via RJ-12 cable. The ESC/POS `ESC p` command in the receipt triggers it — no separate signal needed.

- **Supported in v1**: Star Micronics mC-Print3 (CloudPRNT).
- **Not supported in v1**: Epson TM-T88VI (ePOS-Print, requires same-LAN access; v2 via local agent).

### 16.2 Cash Payment Flow

```
1. Diner taps "Pay with Cash" in app
2. POST /api/restaurant/sessions/[id]/cash { participantId }
   → Cancel auth hold (stripe.paymentIntents.cancel)
   → participant.isCashPayment = true
   → Active OrderItems → CASH_PENDING
   → PrintJob created with CloudPRNT XML (receipt + drawer command)
   → SSE: { event: 'cash_payment', tableId } → dashboard alert
3. KDS: red-bordered CASH_PENDING tile appears
4. Dashboard: "🪙 Table 7 — cash payment"
5. Star Micronics polls GET /api/cloudprint/[deviceId]
   → Server returns PrintJob XML
   → Printer prints receipt, cash drawer opens
6. Printer calls POST /api/cloudprint/[deviceId]/ack { jobId, status: 'PRINTED' }
7. Staff collects cash, taps "Cash Collected" on dashboard
8. POST /api/restaurant/sessions/[id]/cash-collected { participantId, staffId }
   → participant.cashCollectedAt = now()
   → participant.cashCollectedByStaffId = staffId
9. If all participants settled: session CLOSED, table AVAILABLE
```

**Hold cancellation**: when switching to cash, the original auth hold MUST be cancelled via `stripe.paymentIntents.cancel(participant.stripePaymentIntentId)`. Leaving the hold in place blocks funds on the diner's card unnecessarily for ~7 days.

### 16.3 Receipt XML Generation

```typescript
function generateCashReceiptXml(restaurant, participant, orders): string {
  // All money math in Decimal
  const subtotal = orders
    .filter(o => o.status !== 'CANCELLED')
    .reduce((s, o) => s.plus(o.unitPrice.times(o.quantity)), new Decimal(0))
  const tax   = orders.reduce((s, o) => s.plus(o.taxAmount), new Decimal(0))
  const total = subtotal.plus(tax)
  // Cash: no WalkOut service fee, no processor fee. Restaurant pockets the tax on pass-through.

  return `<?xml version="1.0" encoding="utf-8"?>
<CloudPRNT>
  <ContentType>application/vnd.star.starprnt</ContentType>
  <Content>
    <Align>Center</Align>
    <TextEmphasized>${escape(restaurant.name)}</TextEmphasized>
    <FeedLine>1</FeedLine>
    <Text>Table ${escape(participant.session.table.tableNumber)}</Text>
    <Text>${new Date().toLocaleString('en-US')}</Text>
    <FeedLine>1</FeedLine>
    <Align>Left</Align>
    ${orders.map(o => `
      <Text>${o.quantity}x ${escape(o.menuItem.name)}</Text>
      <Align>Right</Align>
      <Text>$${o.unitPrice.times(o.quantity).toFixed(2)}</Text>
      <Align>Left</Align>`).join('')}
    <FeedLine>1</FeedLine>
    <Text>Subtotal: $${subtotal.toFixed(2)}</Text>
    <Text>${escape(restaurant.taxLabel)} (${restaurant.taxRate.times(100).toFixed(0)}%): $${tax.toFixed(2)}</Text>
    <TextEmphasized>TOTAL: $${total.toFixed(2)}</TextEmphasized>
    <Text>PAYMENT: CASH</Text>
    <FeedLine>1</FeedLine>
    <Text>Thank you!</Text>
    <FeedLine>3</FeedLine>
    <PeripheralChannel>1</PeripheralChannel>
  </Content>
</CloudPRNT>`
}
```

**`<PeripheralChannel>1</PeripheralChannel>` opens the cash drawer.** Do not hand-craft the ESC/POS byte sequence — Star's XML format handles it cleanly.

**`escape()`** is mandatory. Menu item names can contain `<`, `>`, `&`. An unescaped item named `Reuben & Fries` breaks the XML. A malicious restaurant could inject arbitrary ESC/POS commands via a crafted menu item name — `security-reviewer` flags any unescaped interpolation here as CRITICAL.

### 16.4 Tap-to-Pay Terminal Mode (v2 — documented for forward compatibility)

Not every walk-in wants to open a tab: a guest grabbing a coffee, a delivery driver, or a diner settling a cash-started tab midway through. WalkOut's answer in v2 is Stripe Terminal's **Tap-to-Pay SDK**: the staff phone itself becomes the card reader, no Stripe Reader hardware required.

**Positioning.** v2 only. Specified here so v1 design choices (staff auth, dashboard routing, receipt generation) don't box out the v2 integration.

**Staff UX**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TABLE 4 · CASH PAYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Tap-to-Pay Terminal
  Hold phone near customer card or device

  Ribeye Steak              $44.00
  Lobster Bisque            $12.00
  PA Tax (6%)                $3.36
  ────────────────────────────────────
  Total                     $59.36

  [ Collect Payment ]
  [ Mark as Cash Instead ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Requirements**:
- Stripe Terminal SDK for iOS / Android (web PWA cannot use Tap-to-Pay; staff app moves to native wrappers in v2).
- Device eligibility: iPhone XS+ on iOS 16.4+, recent Android with NFC and hardware attestation. Non-eligible devices fall back to "Mark as Cash".
- Authorization: STAFF+ with signed-in session. PIN prompt if KDS PIN is set.
- **No `application_fee_amount` on Tap-to-Pay transactions in v1 of this feature.** The 0.5% service fee model assumes an open-tab experience; ad-hoc card-present charges don't generate one. May revisit in v3.

**On success**: generate receipt via the same CloudPRNT path as §16.3. No branching code.

**What this does NOT replace**: the primary diner experience remains authorize-on-arrival, capture-on-departure. Tap-to-Pay exists so the restaurant never has to tell a cash-wielding guest "we can't take your card."

---

## 23. Service Requests (v5.0 domain object)

### 23.1 What This Is

Non-food interactions between diner and floor staff: water refills, silverware, speak-to-server, close-tab hints. Toast OPT treats these as $0 menu items, which conflates kitchen prep with floor service and introduces edge cases in every money calculation. WalkOut models them as a **distinct domain object** (see `ServiceRequest` in `01-architecture-schema.md`).

### 23.2 Types

| Enum value | Display | Icon |
|---|---|---|
| `WATER` | Water | 💧 |
| `REFILL` | Refill drink | 🥤 |
| `SILVERWARE` | Silverware set | 🍴 |
| `EXTRA_PLATE` | Extra plate | 🍽️ |
| `TOGO_CONTAINER` | Togo container | 📦 |
| `HIGH_CHAIR` | High chair | 👶 |
| `CLEAR_TABLE` | Clear table | 🧽 |
| `SPEAK_TO_SERVER` | Speak to server | 🗣️ |
| `CLOSE_TAB` | Close tab | 💳 |

### 23.3 Flow

```
Diner taps "Water" button in /tab/[sessionId]
  → POST /api/sessions/[sessionId]/service-requests { type: 'WATER', participantId }
    Rate limit: 20 req/min per participant (PRD §25.8)
  → ServiceRequest created: status OPEN
  → Diner UI: "Sent" toast, status badge on the request card
  → SSE push to /dashboard/requests and any open /dashboard/tables/[tableId] view
  → NOT to KDS. KDS ignores service request events client-side.
  → Audible chime on floor dashboard (configurable per-device, can be muted)
  → Staff taps "Acknowledge"
    → POST /api/restaurant/service-requests/[id]/acknowledge { staffId }
    → Status OPEN → ACKNOWLEDGED, acknowledgedById = staffId
    → Diner UI: badge updates to "Your server is coming"
  → Staff delivers water, taps "Mark Resolved"
    → POST /api/restaurant/service-requests/[id]/resolve
    → Status ACKNOWLEDGED → RESOLVED, resolvedAt = now()
    → Diner UI: badge fades after 10 seconds
```

Diner can cancel an OPEN request by tapping the status badge (useful if they flagged a server in person and no longer need the digital request).

### 23.4 Special Cases

**`CLOSE_TAB` request**: a hint to staff that the diner wants to leave but is a cash payer, needs an itemized printed receipt, or has another reason to skip self-checkout. It does **not** trigger any payment action automatically. Staff handles payment in person.

**`SPEAK_TO_SERVER`**: for questions, complaints, or special requests that aren't predefined. Optional notes field adds context.

**Paid condiments** (chipotle aioli, blue cheese, truffle aioli at $1 each) are **not** service requests. They are `MenuItem` records in a dedicated "Condiments & Sauces" category. They go through the kitchen, appear on the receipt, and count toward tax and service fee like any food item.

### 23.5 Explicitly NOT on the Receipt

- Service requests never appear on the itemized receipt.
- They don't contribute to `subtotal`, `tax`, or `serviceFee`.
- Hard rule enforced at the capture level: `captureParticipantTab()` reads from `OrderItem`, never from `ServiceRequest`. There is no code path by which a service request can affect the charged total.

This is one of the tests in `tdd-guide.md` — any change that lets a service request bleed into money math is a CRITICAL regression.

### 23.6 Analytics

Dashboard shows:
- Total requests today
- Average time from OPEN to ACKNOWLEDGED
- Average time from ACKNOWLEDGED to RESOLVED
- Request volume by type (which are most common)
- Request volume by hour (when does the floor get busiest)

Slow acknowledgement times are a leading indicator of understaffing. Managers using the floor dashboard well start adjusting staff counts based on this data — a soft operational benefit that pays for itself.

---

## Implementation notes for agents

- `code-reviewer`: KDS must not subscribe to service request events. Check filter logic in the KDS page.
- `security-reviewer`: CloudPRNT XML generation is the single ESC/POS injection surface. Escaping `&`, `<`, `>`, `"`, `'` in interpolated values is mandatory.
- `database-reviewer`: `ServiceRequest.sessionId` with `onDelete: Cascade` is intentional — when a session is cascade-deleted, its requests go with it. Do not change to SetNull.
- `tdd-guide`: critical tests for this module:
  - Cash payment cancels the hold.
  - CASH_PENDING tile appears on KDS, but a water request does NOT.
  - `captureParticipantTab()` with an active `ServiceRequest` does not include it in subtotal, tax, or fee.
  - ESC/POS XML with a menu item named `Reuben & Fries` parses as valid XML and does not inject peripheral commands.
