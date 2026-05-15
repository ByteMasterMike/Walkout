# PRD Module 06 — Security, Risks & Resolved Decisions

Covers PRD sections 24 (Key Challenges, Risks & Mitigations), 25 (Security & Privacy), 26 (Resolved Decisions Log).

**Required reading**: `00-overview.md`. Load any other module your task touches.

---

## 24. Key Challenges, Risks & Mitigations

### 24.1 Race Condition: Simultaneous NFC Taps

Two diners tap at an empty table at the same moment; two sessions could be created. Mitigation: partial unique index `one_active_session_per_table` + catch `P2002` and re-fetch.

```typescript
async function createOrJoinSession(tx, { tableId, restaurantId, displayName, anonToken, dietaryNotes }) {
  const existing = await tx.tabSession.findFirst({
    where: { tableId, status: { in: ['OPEN', 'CLOSING'] } }
  })
  if (existing) return joinExistingSession(tx, existing, { displayName, anonToken, dietaryNotes })

  try {
    return await createSession(tx, { tableId, restaurantId, displayName, anonToken, dietaryNotes })
  } catch (e: any) {
    if (e.code !== 'P2002') throw e
    // Lost the race — the other tap won. Re-fetch and join.
    const winning = await tx.tabSession.findFirstOrThrow({
      where: { tableId, status: { in: ['OPEN', 'CLOSING'] } }
    })
    return joinExistingSession(tx, winning, { displayName, anonToken, dietaryNotes })
  }
}
```

### 24.2 Stripe Connect Onboarding Friction

5-minute Stripe Express onboarding blocks Phase 3 for restaurants. Mitigation: onboarding email template that pre-warms the restaurant ("In the next step Stripe will ask for your EIN, bank routing/account, and a photo ID"). Dashboard shows a "Resume Stripe setup" banner if `stripeConnectOnboarded = false`.

### 24.3 Free-Tier Payment Pricing vs Card-Present Cost

v1 runs all diner payments as card-not-present (NFC-tap → web checkout), which Stripe prices at 2.9% + $0.30 regardless of hardware. Tap-to-Pay in v2 could get card-present rates (~2.7% + $0.05) but isn't available on web. Accept the v1 pricing; v2 reduces it for cash-station charges.

### 24.4 NFC Tag Durability

Stickers will take abuse: heat, spills, alcohol wipes. Mitigation: waterproof PET tags (in `06-overview.md`), 30mm diameter, adhesive-backed. Ship 2–3 spares per table. Onboarding email includes "How to replace a damaged sticker" instructions.

### 24.5 Star Micronics ESC/POS Gotchas

CloudPRNT XML parsing is strict. Common failures:
- Unescaped `&`, `<`, `>`, `"`, `'` in menu item names → XML parse error → print fails silently.
- Missing `<PeripheralChannel>1</PeripheralChannel>` → receipt prints, drawer does not open.
- Wrong `<ContentType>` → printer accepts job, prints garbage.

Mitigations live in the code (`06-kitchen-cash-ops.md` §16.3). Integration test prints against a real mC-Print3 during Phase 4.

### 24.6 CloudPRNT Device Registration

Restaurant has to enter the `cloudPrintDeviceId` on the printer's admin page, pointing at `POST /api/cloudprint/[deviceId]`. Mitigation: `/dashboard/setup/printer` has copy-to-clipboard buttons for the URL and the bearer secret, plus a "Test Print" that queues a hello-world job to verify registration.

### 24.7 Supabase Realtime Connection Limits

Free tier: 200. Pro: 500. At 10 restaurants × 15 tables × multiple staff dashboards + KDS, we approach these.

Mitigation: restaurant dashboard opens one channel per session currently watched (lazy, not every session). Monitor at 400 connections. Plan migration to Upstash Redis pub/sub at 5+ restaurants.

### 24.8 Toast Replacement Sales Cycle

Full POS replacement is a longer sales cycle than a payment widget. Requires: demo environment with fake data, migration story ("run WalkOut on test tables, Toast on others for a week"), 30-second pitch AND 30-minute deep dive. First live restaurant testimonial video is worth more than any marketing spend.

### 24.9 Tax Rate Change Mid-Session

If restaurant updates `taxRate` while sessions are open:
- Existing `OrderItem` rows keep their snapshotted rate.
- New orders use new rate.
- Settings UI must state: "Tax rate change affects new orders only."

### 24.10 Unattributed Tips (No Server Assigned)

Table opens without a `TableAssignment`. Tip is `tipAssignedToStaffId = null`.

Mitigation: dashboard warning on any unassigned active table. Analytics shows "Unattributed: $X.XX" separately. Floor setup reminder on shift start. "Load Yesterday's Setup" reduces setup friction.

### 24.11 Inventory: Shrinkage vs Miscounting (v2)

A low stock count could be a recount error, not real waste. Flag it but don't alarm. Manager adds notes to explain discrepancies. Historical shrinkage rate shown in analytics to distinguish one-off errors from systematic waste.

### 24.12 AI Forecast Accuracy (v2)

- Below 4 weeks: no forecast generated.
- 4–8 weeks: basic forecast, lower confidence.
- 8+ weeks: full trend detection, day-of-week patterns, holiday awareness.
- Manager can always override before ordering.

### 24.13 Host Leaves Before Group

Host departs while joiners are still seated. Covered in user-flow §5.3.1: `hostParticipantId` reassigned to the next-joined active participant, push notification on role change, session stays OPEN as long as at least one held participant remains. Host's own participant captures normally.

### 24.14 Hold Expires Mid-Session

Covered in `02-payments-and-money.md` §11.7. Re-authorization capped at 3 attempts. If all three fail, `holdStatus = EXPIRED` and the session is flagged for staff review rather than silently auto-capturing an invalid card. Dashboard surfaces it in Pending Settlements.

### 24.15 KDS Walk-Off

KDS tablet stays logged in indefinitely. If physically removed from the kitchen, it exposes live data.

Mitigations (see `03-auth-staff-rbac.md` §14.6):
- Optional 4-digit PIN on the KDS staff account, required for destructive actions only.
- ADMIN can remotely revoke the KDS session from `/dashboard/setup/staff`; the device logs out on next poll.

### 24.16 Mobile SSE Disconnection

Mobile browsers throttle backgrounded tabs. A diner returning to the app mid-meal sees stale state.

Mitigation (see `01-architecture-schema.md` §10.4): client reconnects on `visibilitychange` with exponential backoff; re-fetches full session state on reconnect to reconcile missed deltas.

### 24.17 Write-Off Risk

Covered in Decisions §OPEN5: restaurant bears write-off risk. Disclosed in Terms of Service. Manager can write off a failed capture after 96 hours via Pending Settlements.

---

## 25. Security & Privacy Considerations

### 25.1 Payment Security

- No card data touches the application database or server.
- Stripe.js loaded from `https://js.stripe.com`, never self-hosted.
- All PaymentIntents use idempotency keys **with attempt counter** (v5.0 fix).
- Stripe webhook: `req.text()` before any parsing (signature verification requires raw bytes).
- Stripe Connect: restaurant funds never sit in WalkOut's account. `on_behalf_of` set on every PaymentIntent.

### 25.2 Tax Data Integrity

- `taxRate` and `taxAmount` snapshotted on `OrderItem` at creation, immutable.
- Tax settings changes affect only future orders.
- Quarterly tax report CSV generated from immutable snapshots — always accurate regardless of intervening rate changes.

### 25.3 Tip Security

- HMAC-SHA256 signed tip tokens with `TIP_SECRET`.
- `maxTipCents` cap at 50% of pre-tax subtotal. Prevents overcharging.
- `expiresAt` 24h. Prevents replay attacks.
- Server verifies signature AND expiry AND cap before any capture.
- Single-use: `TabParticipant.tipPromptToken` nulled on successful tip resolution.

### 25.4 CloudPRNT Security

- Printer authenticates via `Authorization: Bearer ${CLOUDPRINT_SECRET}` header.
- Secret never exposed to client-side code.
- Print content generated server-side. No user-supplied input reaches the ESC/POS layer unvalidated.
- Restaurant-to-printer binding: `printJob.restaurantId === device.restaurantId` verified on every poll response.

### 25.5 Staff Invite Security

- Tokens: UUIDv4, expire 72 hours, single-use.
- Marked ACCEPTED on first use; subsequent attempts rejected with 401.
- Email delivery via Resend with bounce handling (alerts ADMIN if invite bounces).

### 25.6 NFC Tag Security

- `nfcTagId` is UUIDv4 (~122 bits entropy), unguessable.
- Even if enumerated: attacker can only open a tab at that table, requires physical presence to order food, all food is routed to the kitchen. Not a meaningful attack surface.

### 25.7 Content Security Policy

Update `next.config.ts` CSP from PokerPay — **add Stripe, remove camera**:

```typescript
// next.config.ts
const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.supabase.com https://generativelanguage.googleapis.com",
  "frame-src https://js.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// DO NOT include this header anymore (PokerPay had it, WalkOut does not use camera):
//   { key: 'Permissions-Policy', value: 'camera=(self)' }
```

`'unsafe-eval'` required for Stripe.js. Remove it only if Stripe SDK is no longer needed.

### 25.8 Rate Limiting

| Route | Limit |
|---|---|
| `/api/sessions` (create) | 10 req/min per IP |
| `/api/auth/*` | 5 attempts per 15 min per IP |
| `/api/sessions/*/service-requests` | 20 req/min per participant |
| `/api/restaurant/kds/verify-pin` | 5 attempts per 15 min per staff record |
| `/api/cron/*` | `CRON_SECRET` header whitelist only |
| `/api/cloudprint/*` | `CLOUDPRINT_SECRET` header + printer IP range |

Implementation: Upstash Redis rate limit middleware on the relevant route groups. Configure limits in `src/lib/rate-limit.ts` as a single source.

### 25.9 Data Retention

- `AnonSession`: expire 24h, cleared nightly by `cleanupSessions()`.
- `TabParticipant.anonToken`: nulled after session close + 7 days, OR immediately on guest → account migration (§11.8).
- `TabParticipant.tipPromptToken`: nulled after use or 15-min tip-window expiry.
- `PrintJob.content`: retained (needed for receipt disputes). DO NOT purge.
- `ServiceRequest`: retained indefinitely (analytics).
- Inventory data: retained indefinitely (historical forecast accuracy, v2).

### 25.10 Secrets Management

- All secrets in Vercel environment variables, segregated by environment (Development / Preview / Production).
- Required env vars for production: `DATABASE_URL`, `DIRECT_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TIP_SECRET`, `CLOUDPRINT_SECRET`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `GEMINI_API_KEY` (v2), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
- `security-reviewer` must flag any PR that introduces a new secret without a matching `.env.example` update.
- Rotation runbook: if a secret is exposed in git history, rotate immediately, invalidate all sessions signed with the previous secret, and force re-authentication.

---

## 26. Resolved Decisions Log

| ID | Decision | Resolution |
|---|---|---|
| OPEN1 | Target market | US first. Warminster, PA launch. USD. PA sales tax 6%. |
| OPEN2 | Stripe Connect from day one? | Yes, from Phase 3. Money never sits in WalkOut's account. |
| OPEN3 | Monetization model | 0.5% of pre-tax food subtotal, charged to consumer as "WalkOut Service Fee" (v5.0 simplification from 1.5% + $0.99). |
| OPEN4 | Flat or dynamic hold? | Flat hold. $1 default, restaurant-configurable $1–$150. |
| OPEN5 | Write-off risk | Restaurant bears it. Disclosed in Terms of Service. 96h default window. |
| OPEN6 | NFC sticker programming | Pre-programmed by WalkOut, shipped with onboarding kit. UWB = native app future. |
| OPEN7 | Two Vercel cron jobs? | One combined cron `/api/cron/maintenance`, three internal functions. |
| OPEN8 | Team | Two co-founders. One technical, one business/ops. |
| OPEN9 | Restaurant partners? | None yet. First target: Warminster cafes and bars. |
| NEW | V1 feature scope | KDS + RBAC + Cash management (full Toast replacement from day one). |
| NEW | Stripe Terminal | V2 only. |
| NEW | Hardware | WalkOut ships pre-programmed NFC stickers. Restaurant sources rest via Amazon. |
| NEW | Supported printer | Star Micronics mC-Print3 (CloudPRNT). Epson goes to v2. |
| NEW | RBAC model | ADMIN / MANAGER / STAFF / DINER. ADMIN = Restaurant record. |
| NEW | KDS access | Permanently-authenticated shared device. No per-staff logins. |
| NEW | Tip distribution | DIRECT (default) or POOL. Restaurant chooses. Legal disclaimer shown for POOL. |
| NEW | Server assignment | Manager assigns servers to tables at shift start via `/dashboard/floor`. |
| NEW | V1 tip money flow | Tips land in restaurant's Connect account. WalkOut tracks attribution. |
| NEW | US tip suggestions | 18% / 20% / 22% of pre-tax subtotal. |
| NEW | Tax calculation | PA 6% on pre-tax food subtotal only. Not on service fee. Not on tips. |
| NEW | Tax on Stripe | Unavoidable. Restaurant remits to PA quarterly. |
| NEW | Service fee base | 0.5% of pre-tax food subtotal. Not on tax/tip/requests. |
| NEW | Image resizing | Cloudflare Images URL transforms (not `sharp`). |
| NEW | Inventory forecasting | V2. Gemini. Item-level (portions). Ingredient mapping = v3. |
| NEW | Inventory data entry | Both: delivery receiving + weekly count. |
| NEW | Forecast output | Suggested quantities + formatted PO + shortage alerts. |
| v5.0 | Service requests | Separate domain object, routes to floor (NOT KDS), excluded from $ math. |
| v5.0 | Kitchen notes | Existing `OrderItem.notes`, surfaced in item detail modal. No modifier system in v1. |
| v5.0 | Dietary notes | Optional participant-level field, prepended to every KDS ticket. Account has default. |
| v5.0 | "How It Works" banner | Sticky on tab page, first visit only. `localStorage` flag. Dismissible. |
| v5.0 | Featured items | Uses existing `isPopular` flag. Horizontal scroll at top of menu. |
| v5.0 | Menu search | Icon in nav bar, filter-as-you-type on name + description. |
| v5.0 | Allergens | Full list in item detail modal, icon badges on menu cards for common ones. |
| v5.0 | SMS / TCPA compliance | Opt-out copy at every phone collection field. |
| v5.0 | Idempotency retry | Keys include attempt counter stored on `TabParticipant`. |
| v5.0 | Overflow fee prorating | Floor-then-remainder. Split sums exactly to total fee. |
| v5.0 | Tip pool concurrency | Partial unique index + upsert pattern. One OPEN pool per restaurant. |
| v5.0 | Cron timezone | Schedule in UTC, function converts to restaurant tz, DST-aware via Intl. |
| v5.0 | Hold re-auth | Capped at 3 attempts. New PI created, old cancelled. EXPIRED flag for staff. |
| v5.0 | Host leaves group | Session stays OPEN. Host role reassigned to next-joined active participant. |
| v5.0 | Staff turnover | `tipAssignedToStaffId` uses `onDelete: SetNull`. |
| v5.0 | Decimal precision | All money math in Decimal. Cents only at final Stripe call. |
| v5.0 | KDS physical security | Optional 4-digit PIN for destructive actions. Remote logout via admin. |
| v5.0 | Guest → account migration | Reuses existing Stripe Customer + PaymentMethod. Transaction-atomic. |
| v5.0 | Mobile SSE | Reconnect on visibilitychange with exponential backoff. Re-fetch on reconnect. |
| v5.0 | Staff comp / discount | V2 roadmap. Per-item void + percent discount with reason code. |
| v5.2 | One charge per tab | Tip included in single combined capture. Replaces v5.1 two-charge model. |
| v5.2 | 20% default tip | Applied after 15 min in AWAITING_TIP if no explicit choice. |
| v5.2 | Table Cleared orthogonality | Seating state and payment state are independent state machines. |
| v5.2 | Pro-rata fee allocation | `(component / total) × total_fee`, written to `feeAllocatedTo*` fields at capture. |
| v5.2 | Pending Settlements | New page at `/dashboard/settlements` for MANAGER+ to resolve stuck sessions. |
| v5.2 | absorb-fee policy | Restaurant toggle `absorbTipProcessingFee`; when true, server gets gross tip. |

---

## Implementation notes for agents

- `security-reviewer`: the tests/checks in §25 are all mandatory. Missing any of them is a CRITICAL finding.
- `code-reviewer`: CSP config in `next.config.ts` is part of every PR that touches auth or payments — a regression here breaks Stripe integration.
- All agents: when user requests a change that could reopen a decision in §26, explicitly surface that the decision was resolved. The user may still choose to override, but it must be a conscious choice.
