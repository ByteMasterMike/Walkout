# PRD Module 05 — Dashboards & Diner Interface

Covers PRD sections 19 (Notifications), 20 (AI Inventory — v2 stub), 21 (Restaurant Dashboard), 22 (Diner Interface).

**Required reading**: `00-overview.md`. Load `02-payments-and-money.md` if working on Pending Settlements (§21.8).

---

## 19. Notification Infrastructure

### 19.1 Channel Priority by Event

| Event | Channel 1 | Channel 2 | Channel 3 |
|---|---|---|---|
| Receipt (capture confirmed) | Web Push | Resend email | — |
| Tip window opened (v5.2) | Web Push | Resend email (after 10 min if no action) | — |
| Hold failed | Web Push + Resend | Twilio SMS | — |
| Capture failed | Push + Resend + SMS | — | — |
| 3DS payment link | Push + Resend | Twilio SMS | — |
| Hold re-auth failed (v5.0) | Push + Resend + SMS | — | — |
| Service request acknowledged (v5.0) | In-app toast | — | — |
| Staff invite | Resend email only | — | — |
| Forecast ready (v2) | Web Push | Resend email | — |
| Low stock alert (v2) | Web Push | Resend email | — |

### 19.2 iOS Web Push Limitation

Web Push on iOS requires the PWA installed to home screen (Safari → Share → Add to Home Screen). Most first-time visitors won't do this. **Treat email as an equally reliable primary channel, not a fallback.** Design message copy so it reads well either way.

### 19.3 SMS / TCPA Compliance

All phone-number collection screens show, immediately adjacent to the phone input:

> "Your phone number is used for order updates. Messaging and data fees may apply. Message frequency varies. Reply STOP to opt out."

Applies to:
- `/join/[nfcTagId]` guest flow (when phone field is shown)
- `/join/[nfcTagId]` group host contact info
- Diner account registration

Phone number is **never required**. Email or push are the default receipt channels. SMS is only used when the user explicitly provides a number.

### 19.4 Resend Email Templates

- **Sales tax receipt** (post-capture; includes resolved tip line per §18.7)
- **Tip window opened** (sent on `AWAITING_TIP` entry, links to `/tip/[signedToken]`)
- **Capture failed payment link**
- **3DS required payment link**
- **Hold re-auth failed**
- **Staff invite**
- **Forecast ready** (v2)
- **Purchase order to supplier** (v2)

All templates rendered server-side (MJML recommended), sent via Resend. Never render HTML email on the client.

### 19.5 Web Push Setup

```typescript
// Generate VAPID keys once, store in env.
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:ops@walkoutofficial.com

// Client (service worker registration)
const registration = await navigator.serviceWorker.register('/sw.js')
const sub = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
})
await fetch('/api/diner/push-subscription', { method: 'POST', body: JSON.stringify(sub) })

// Server (send)
import webpush from 'web-push'
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
await webpush.sendNotification(diner.pushSubscription, JSON.stringify({
  title: 'Brew & Blade — pick a tip',
  body:  'A 20% tip applies in 14 minutes unless you choose otherwise.',
  url:   `/tip/${tipToken}`,
}))
```

---

## 20. AI Inventory Forecasting (v2 — do not build in v1)

Post-launch, after 8+ weeks of live order history.

Summary (full spec in v4.0 PRD §20, retained for reference):
- Three-layer model: demand (auto from orders), supply (manual delivery + count), AI forecasting.
- Item-level (portions), not ingredient-level (ingredient bill-of-materials is v3).
- Gemini-generated weekly PO, manager approves before ordering.
- Cron runs on `forecastDayOfWeek` in restaurant's timezone, guarded by "already generated this week" check.
- Portions deducted from `InventoryItem.currentOnHand` at `OrderItemStatus.SERVED`, not PENDING/CONFIRMED (cancelled orders must not reduce inventory).

Below 4 weeks of data: no forecast. 4–8 weeks: basic forecast, low confidence. 8+ weeks: full trend detection, day-of-week patterns, holiday awareness. Manager can always override before ordering.

**For v1**: the `InventoryItem`, `StockDelivery`, `StockCount`, `WeeklyForecast`, and `StockAlert` models and routes are stubbed in the schema but no UI is built. Feature flag: `restaurant.inventoryEnabled` (default `false`).

---

## 21. Restaurant Dashboard

### 21.1 Page Structure

```
src/app/dashboard/
├── layout.tsx              RBAC-aware sidebar + NextAuth guard
├── page.tsx                Overview (§21.7)
├── tables/
│   ├── page.tsx            Live table grid (§21.3)
│   └── [tableId]/
│       └── page.tsx        Live tab detail (§21.4)
├── kitchen/
│   └── page.tsx            KDS (see 04-kitchen-cash-ops.md §15)
├── floor/
│   └── page.tsx            Floor Setup, MANAGER+ (see 02-payments-and-money.md §17.6)
├── requests/
│   └── page.tsx            Service request queue (§21.5)
├── menu/
│   └── page.tsx            Menu CRUD, MANAGER+
├── settlements/
│   └── page.tsx            Pending Settlements, MANAGER+ (§21.8)
├── analytics/
│   └── page.tsx            Revenue, tax, tips, menu, operations (§21.6)
├── setup/
│   ├── page.tsx            Tables, NFC URLs, Stripe Connect, printer
│   └── staff/
│       └── page.tsx        Staff list, invite, KDS logout, ADMIN only
└── inventory/              v2
```

### 21.2 RBAC-Aware Sidebar

```
[ALL ROLES]:     🍽 Live Tables · 📟 Kitchen · 🔔 Requests
[MGR + ADMIN]:   🗂 Floor Setup · 📋 Menu · 📊 Analytics · 🧾 Settlements
[ADMIN ONLY]:    ⚙️ Setup · 👥 Staff · 💳 Stripe Payouts
[V2, MGR+ADMIN]: 📦 Inventory
```

Sidebar rendering reads `session.role` and hides links the user can't access. Route-level guards are the security layer (see `03-auth-staff-rbac.md` §14.3); hiding the link is UX only.

### 21.3 Live Table Grid

**Visual states**:
- 🟢 Green: AVAILABLE
- 🟡 Amber: OCCUPIED — shows covers + elapsed time + running total
- 🔴 Red: CLOSING — session is settling
- 🟠 Orange indicator: hold failed
- 💰 Cash icon: cash participant at table
- 🔔 Blue dot: open service request at this table

**Per-card content**:
- Table number (large)
- Assigned server name, or "Unassigned" warning in yellow
- Cover count, elapsed time, running total
- Quick actions: "Table Cleared", "Mark Cash", "Add Item" (opens modal)

Real-time via `/api/restaurant/stream` SSE. One subscription per dashboard session — every card on the page shares it.

### 21.4 Live Tab Detail (`/dashboard/tables/[tableId]`)

- Participant list: name, hold status, orders, payment status.
- Orders per participant: item, qty, unit price, tax, status badge, elapsed time, notes, allergens.
- **Service requests list** (v5.0): open requests for this table, with "Acknowledge" / "Resolve" buttons.
- KDS-like status buttons: Confirm → Prepping → Served → Cancel.
- "Add Item": search menu, add to any participant (walked-up orders staff takes verbally).
- "Table Cleared": **primary departure trigger**. Prominent, top-right. Fires `/api/restaurant/sessions/[id]/clear`.
- "Mark Cash": switch participant to cash flow (see 04-kitchen-cash-ops.md §16.2).
- "Cash Collected": confirm cash received.
- Payment alerts: failed holds, failed captures, 3DS links, expired re-auths — all linking to the relevant action.

### 21.5 Service Requests Page (`/dashboard/requests`)

Live queue of all OPEN service requests across the restaurant, sorted oldest first.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SERVICE REQUESTS — 3 open, 1 acknowledged
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🔔 Table 7     Water (Michael)                2:14 ago   [ Acknowledge ]
  🔔 Table 12    Silverware (Sarah)             1:08 ago   [ Acknowledge ]
  🔔 Table 3     Close tab (James)              0:34 ago   [ Acknowledge ]

  ✓  Table 9     Togo container — Alex Chen     0:42 ago   [ Mark Resolved ]
```

Audible chime on any new OPEN request. Mutable per-device (localStorage flag). Chime file stored at `public/sounds/request-chime.mp3` (short, unobtrusive).

### 21.6 Analytics Page

Sections:
- **Revenue**: F&B net, tips collected (gross/fee/net per §17.9).
- **Tax**: collected this quarter, next remittance deadline, CSV download.
- **Platform**: WalkOut service fees collected (for restaurant's transparency).
- **Staff**: per-server tips (DIRECT) or pool summary (POOL).
- **Menu**: most ordered, revenue by item, 86'd items log.
- **Operations**: avg session duration, peak hours heatmap.
- **Service Requests**: avg time to acknowledge, volume by type, volume by hour.

All charts render from Prisma aggregates — no separate analytics pipeline in v1. Queries use `GROUP BY` on indexed columns; watch for slow scans as data grows.

### 21.7 Owner Dashboard Overview (`/dashboard`)

Landing page for ADMIN and MANAGER. The "glance screen" that answers what most owners open the product to check: how's today going, how much tax do I owe, which tables are active.

**Header**: restaurant name, view tabs (OVERVIEW / REVENUE / STAFF / TAX), live SSE connection timestamp. Stale connection greys out the timestamp and shows a reconnect spinner.

**Top row: four KPI cards.**

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ TODAY'S REVENUE  │ COVERS           │ TIPS COLLECTED   │ TAX OWED (PA)    │
│ $2,840           │ 87               │ $201             │ $170             │
│ ↑ 14% vs last Wed│ ↑ 6  vs last Wed │ ↑ 20% avg tip    │ Q2 remit Jul 31  │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

- **Today's Revenue**: F&B net of WalkOut service fee and Stripe processing. Day-over-day compares to same weekday last week (more stable than yesterday).
- **Covers**: distinct participant count across all sessions opened today.
- **Tips Collected**: dollar total + avg tip % of pre-tax food for context.
- **Tax Owed (PA)**: running quarter-to-date liability + next remittance deadline.

**Middle-left**: weekly revenue bar chart, 7 bars, food+bev only (tax and tips excluded so owner isn't visually double-counting money they don't keep). Secondary metrics below: Avg Check, Walk-Out Rate (sessions departed via auto-capture vs. staff-closed), Active Now (open tabs, live).

**Middle-right**: live tables panel. 3×3 condensed grid, same SSE subscription as the live table grid (no double-fetch). Click a chip → deep-links to table detail.

**Bottom-left**: tips by server bar chart, proportional-width bars.

**Bottom-right**: tax summary card with quarter-to-date, remittance deadline, CSV and tip-report buttons.

**Real-time**: every card subscribes to the same SSE channel. A new order on table 7 updates Active Now, the T7 chip, and Today's Revenue within one tick. No polling, no refresh button.

**Deliberately NOT shown**: COGS, labor cost, P&L. Those live in the accounting system the restaurant already uses (QuickBooks, Restaurant365). WalkOut's dashboard is strictly a view onto money that flowed through WalkOut, not a full bookkeeping replacement.

### 21.8 Pending Settlements Panel (`/dashboard/settlements`) — NEW in v5.2

Decoupling seating state from payment state (see `02-payments-and-money.md` §11.6) means a table can be cleared and re-seated while the previous party's payment is still resolving. Usually invisible; when something goes wrong, the restaurant needs one place to see and resolve it. This page is that place.

**Who sees it**: MANAGER and ADMIN. STAFF does not — by design, STAFF should be focused on service, not chasing unresolved charges.

**What lives here**: any session that has left OPEN but not reached CAPTURED (success) or RESOLVED (manual write-off/refund):

- `AWAITING_TIP`: in the 15-min tip window. Shown with live countdown. No action needed unless manager wants to force-resolve (diner still at the bar adding a tip verbally).
- `CAPTURE_FAILED`: capture fired, Stripe hard-declined. Actions: **Retry** / **Contact Diner** / **Write Off**.
- `CAPTURE_PENDING`: capture fired, Stripe hasn't confirmed success/failure within expected window (rare, webhook delay). Action: **Check Stripe Status** (re-queries Stripe directly).
- `HOLD_EXPIRED`: auth hold expired before capture could fire (§11.7 re-auth exhausted). Actions: **Request New Card** / **Write Off**.
- `MANUAL_REVIEW`: staff-flagged for any reason (disputed item, comp, etc.). Free-text notes + **Resolve** / **Refund**.

**Layout**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PENDING SETTLEMENTS — 4 open         as of 10:28 PM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ⏱ T7  Awaiting tip (7:22 remaining)       Michael S.
     Food $42.00 · tax $2.52 · fee $0.21              [View]
                                             [Force 20% now]

  ⚠ T12 Capture failed (insufficient funds)  Sarah K.
     Attempted $89.40 · failed 4 min ago              [View]
                              [Retry]  [Contact]  [Write Off]

  ⚠ Bar1 Hold expired (reauth exhausted)     Guest
     Meal total $34.50 · hold expired 2h ago          [View]
                                     [Request New Card]

  ? T3  Manual review (tagged by Alex)       James W.
     "Comp for dropped entree"                         [View]
                                      [Resolve]  [Refund]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total exposure: $175.42 · Last 24h: $2,840 settled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Action semantics**:
- **View**: opens full tab detail in modal overlay. Read-only for AWAITING_TIP (no edits before capture lands). Editable for CAPTURE_FAILED and later (add/remove items, adjust tip).
- **Force 20% now**: calls `captureParticipantTab()` with 20% default immediately. For when the diner has clearly left and the manager wants to close the session rather than wait the window.
- **Retry**: re-fires capture against the original PaymentMethod. Only available if Stripe decline code is retriable (e.g. `insufficient_funds` with a retry window).
- **Contact**: opens pre-filled email/SMS to diner with tab amount and a `/pay/[signedToken]` link for manual settlement.
- **Write Off**: marks session RESOLVED with `writeOffAmount = total`, reverses tip attribution (server isn't credited for money that never arrived), records write-off for accounting export. See `06-security-risks-decisions.md` for write-off exposure policy.
- **Request New Card**: sends notification to diner with link to re-enter payment. Session stays in HOLD_EXPIRED until they act.
- **Refund**: Stripe refund modal, full or partial, with reason code.

---

## 22. Diner Interface

### 22.1 Page Structure

```
src/app/
├── join/
│   └── [nfcTagId]/page.tsx    NFC landing, name entry, payment sheet
├── tab/
│   └── [sessionId]/
│       ├── page.tsx           Menu + My Tab, the main experience
│       └── pay/
│           └── page.tsx       Guest manual pay (fallback)
├── tip/
│   └── [tipToken]/page.tsx    Tip selector (signed token)
├── account/
│   ├── page.tsx               Payment method, tip preference, dietary
│   └── history/page.tsx       Past sessions with itemized orders
```

### 22.2 `/tab/[sessionId]` — The Main Experience

**First-visit banner** (sticky, dismissible, one-time per device via `localStorage`):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HOW WALKOUT WORKS
  1. Order right from this page
  2. Eat without thinking about the check
  3. Just leave — we'll charge your card and text you
     the receipt. Pick a tip or let 20% apply.
                                     [ Got it, thanks ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Featured Items row** (horizontal scroll, top of menu): uses `MenuItem.isPopular` flag.

**Menu section**:
- Category filter pills.
- Item grid with allergen badges (peanut, shellfish, gluten, dairy — icons from the allergens array).
- Search icon in nav bar → filter-as-you-type on name + description.
- Item detail modal: full allergens list, "Notes for the kitchen" free-text field, "Add to Cart $XX.XX" button.

**My Tab**:
- Item list with status badges (⏳ Pending → 👨‍🍳 Prepping → ✅ Served).
- Running total:
  ```
  Subtotal:            $34.50
  PA Sales Tax (6%):    $2.07
  WalkOut Service Fee:  $0.17
  ─────────────────────────
  Total:               $36.74
  ```
- **Service Requests section** (v5.0) below food orders:
  ```
  Need something?
  [ 💧 Water ]  [ 🍴 Silverware ]  [ 📦 Togo box ]  [ More... ]
  ```
  Tapping creates a `ServiceRequest`. Small confirmation toast: "Request sent. Your server will be right with you." Shows status inline: "Sent → Acknowledged → Done".
- Group panel (collapsible): other participant names + order counts.
- Hold status banner: "✓ Your card is on hold. You'll only be charged for what you order."
- Idle warning toast at 10-min threshold (see `02-payments-and-money.md` §11.6).

### 22.3 Item Detail Modal

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [photo]
  Cheeseburger                            $14.00
  ─────────────────────────────────────────────
  House-ground chuck, aged cheddar, pickles,
  brioche bun. Served with fries.

  ⚠ Contains: dairy, gluten
  ⚠ Can contain traces of: peanuts

  Notes for the kitchen (optional):
  [                                            ]

  [ Add to Cart — $14.00 ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 22.4 Account Page

```
PAYMENT & CHECKOUT
  Card on file: Visa ••4242  [Change] [Remove]
  [ ● ON ]  Instant checkout, charged automatically when you leave

TIP PREFERENCE
  ○ No tip   ○ Always 18%   ● Ask me after
  ○ Always 20%   ○ Always 22%

DIETARY NOTES (v5.0)
  [ Text field, 100 char cap ]
  Shared with the kitchen on every tab you open.

AUTO-CHARGE TIMEOUT
  Charge after [ 15 ] minutes of inactivity

NOTIFICATIONS
  [ ● ] Push notifications    [ ● ] Email receipts
```

Tip preference options map 1:1 to `TipBehavior` enum values (`AUTO_NONE` / `AUTO_18` / `ASK` / `AUTO_20` / `AUTO_22`).

### 22.5 PWA Configuration

```json
{
  "name":             "WalkOut",
  "short_name":       "WalkOut",
  "description":      "Walk in. Eat. Walk out.",
  "start_url":        "/",
  "display":          "standalone",
  "background_color": "#0a0a0a",
  "theme_color":      "#0a0a0a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Service worker handles:
- Offline menu cache (last-fetched menu, fallback when connectivity drops mid-meal).
- Web Push message display.
- No offline order submission (orders require server-side session state).

---

## Implementation notes for agents

- `code-reviewer`: SSE connection health indicator on owner dashboard must share the restaurant-level subscription with live tables, not open a second connection.
- `security-reviewer`: the `/pay/[signedToken]` link sent from Pending Settlements "Contact" action uses the same TipToken HMAC pattern; verify it is single-use and expiry-checked.
- `database-reviewer`: owner dashboard KPI queries hit `TabSession`, `OrderItem`, `TabParticipant`, `TipPool`. Ensure indexes cover `(restaurantId, createdAt)` on sessions and `(sessionId)` on order items. Add a materialized view ONLY if query times exceed 500ms on a real production dataset.
- `tdd-guide`: Pending Settlements "Write Off" must reverse tip attribution. Critical test: write-off a CAPTURE_FAILED session and verify `TipPoolEntry` for that participant is deleted or flagged, and the per-server tip report no longer counts that tip.
