# PRD Module 07 — Phased Build Plan & Appendices

Covers PRD section 27 (Phased Build Plan), Appendix A (Dependencies), Appendix B & C (environment & testing notes).

**This module is the schedule.** Every feature ships from one of these phases. If a user asks for something that isn't in a phase, either find it here under a different name or flag that it's out of scope.

**Required reading**: `00-overview.md`. Other modules loaded per phase.

---

## 27. Phased Build Plan

Team: one technical founder, one business/ops co-founder. Non-technical co-founder handles restaurant outreach, NFC sticker logistics, onboarding guide writing, demo environment, hardware research, and first testimonial video.

### Phase 1: Foundation + RBAC (Weeks 1–2)

Goal: NFC tap → join → open tab. Restaurant + Staff auth with full RBAC.

Relevant modules: `01-architecture-schema.md`, `03-auth-staff-rbac.md`.

**Work items**
- Fork PokerPay, update `package.json`, remove poker references throughout.
- Update Prisma schema: all v5.0 + v5.2 models including `ServiceRequest`, `feeAllocatedTo*` fields, attempt counters.
- Migration on local Postgres (Docker), verify on Supabase staging.
- Apply partial unique indexes (in migration SQL, not schema): `one_active_session_per_table`, `one_open_pool_per_restaurant`.
- Remove dependencies: `@zxing/browser`, `@zxing/library`. Keep `qrcode`.
- Add dependencies: `stripe`, `@stripe/stripe-js`, `web-push`, `decimal.js`.
- Update `next.config.ts` CSP: add Stripe, remove camera.
- Build `/api/join/[nfcTagId]` public route.
- Build `/join/[nfcTagId]` page: name entry, dietary notes, session open/join, consent copy, SMS/TCPA opt-out.
- Build anonymous session cookie middleware (`tabs_anon`, httpOnly, 24h).
- Build Restaurant ADMIN registration + login.
- Build staff invite flow: POST invite → Resend → `/auth/staff/invite/[token]` → set password → session.
- Build RBAC middleware, route-level role checks.
- Build `/dashboard/setup`: create tables, view NFC URLs, download QR codes.
- Build combined cron `/api/cron/maintenance`, skeleton with stub functions.
- Build race-condition-safe session creation (try/catch on P2002, re-fetch).

**Tests**
- Two simultaneous joins → only one session created, both participants attach correctly.
- Staff invite → click link → set password → logs in as STAFF.
- MANAGER cannot access `/dashboard/setup`.
- `tabs_anon` cookie is httpOnly, secure, 24h.

**Deliverable**: NFC tap opens a tab. Full RBAC working. Race condition handled.

---

### Phase 2: Menu + Ordering + KDS + Floor Setup + Service Requests (Weeks 3–4)

Goal: browse menu, add items, kitchen sees orders, service requests flow to floor.

Relevant modules: `01-architecture-schema.md` (API & SSE), `04-kitchen-cash-ops.md`, `05-dashboards-ui.md`.

**Work items**
- Build `MenuItem` + `MenuCategory` CRUD (ADMIN + MANAGER).
- Build `/dashboard/menu`: category/item management, photo upload to R2, allergen tagging.
- Build `/api/restaurants/[restaurantId]/menu` public menu read with search param.
- Build tax snapshot at order creation (`taxRate` and `taxAmount` on `OrderItem`).
- Build `/api/sessions/[sessionId]/orders` with price + tax snapshot + kitchen notes.
- Build `/tab/[sessionId]` page:
  - "How It Works" banner (sticky on first visit, `localStorage` flag).
  - Featured Items row (uses `isPopular`).
  - Category filter pills, item grid with allergen badges.
  - Menu search in nav bar (filter-as-you-type).
  - Item detail modal: allergens display, kitchen notes field.
  - My Tab: order list, status badges, running total with tax + fee breakdown.
  - Service Requests section with type buttons.
- Build SSE infrastructure: `/api/sessions/[sessionId]/stream` + `/api/restaurant/stream` (both Edge runtime, Supabase Realtime, mobile reconnection logic).
- Build client `useSessionStream` and `useRestaurantStream` hooks with visibility-based reconnect.
- Build `/dashboard/tables`: live table grid with SSE, color coding, server name, service request indicator.
- Build `/dashboard/tables/[tableId]`: live tab detail with service request queue.
- Build `/dashboard/kitchen`: full-screen KDS tile grid (client-side filter ignores service request events).
- Build `/dashboard/requests`: dedicated service request queue with audible chime.
- Build `TableAssignment` model + CRUD API.
- Build `/dashboard/floor`: server assignment UI (MANAGER + ADMIN), "Load Yesterday's Setup".
- Build `assignServerToSession()`, called at session creation.
- Build unassigned table warning on live table grid.
- Build "Add item" (staff adds verbal order to tab).
- Build "86 item" (toggle `isAvailable`).
- Build service request acknowledge + resolve endpoints.

**Tests**
- Order appears on dashboard + KDS in real time.
- Tax correctly snapshotted. Change restaurant `taxRate`; existing orders unaffected.
- Server assignment → tip attribution → correct staff credited.
- KDS tile advances PENDING → PREPPING → SERVED.
- Service request creates → fires to dashboard (NOT KDS) → staff acknowledges → diner sees status change.
- Mobile SSE reconnects after backgrounding the browser tab.

**Deliverable**: full ordering flow. KDS live. Service requests working. Core Toast Replacement pitch demonstrable.

---

### Phase 3: Payments — Hold & Capture (Weeks 5–7)

Goal: auth hold on arrival. Capture on departure. Full payment lifecycle with all v5.0 + v5.2 behavior.

Relevant modules: **`02-payments-and-money.md` (primary)**, `01-architecture-schema.md`, `05-dashboards-ui.md` (Pending Settlements).

**Work items**
- Configure Stripe Connect platform account.
- Build `/api/restaurant/stripe/connect`: Stripe Express onboarding redirect.
- Configure Apple Pay domain verification: `public/.well-known/apple-developer-merchantid-domain-association`.
- Build SetupIntent creation in `/api/sessions` and `/api/sessions/[id]/join`.
- Build join-page Stripe payment sheet (Apple Pay / Google Pay / Card).
- Build `/api/sessions/[sessionId]/hold`: create auth hold with attempt-counter idempotency key.
- Build hold-failed UI: "Card declined. Try a different card." Menu blocked until HELD.
- Build `captureParticipantTab()` with full capture math (see `02-payments-and-money.md` §11.4):
  - All math in Decimal until final Stripe call.
  - Subtotal from snapshotted `OrderItem.unitPrice`.
  - Tax from snapshotted `OrderItem.taxAmount` (sum, not recomputed).
  - Service fee: 0.5% of pre-tax subtotal.
  - Preset/custom tip: % of pre-tax subtotal only.
  - Standard capture (total ≤ hold).
  - Overflow path with **floor-then-remainder** application fee prorating.
- Build `/api/webhooks/stripe`: all event handlers, `req.text()` before parsing, including `reauth` type.
- Build tip attribution in webhook handler (DIRECT vs POOL, TipPoolEntry via upsert with partial unique index).
- Build pro-rata fee allocation write-back (`feeAllocatedTo*Cents`, see §17.8).
- Build `/api/sessions/[sessionId]/checkout`: diner-initiated departure → AWAITING_TIP.
- Build `/api/restaurant/sessions/[id]/clear`: staff "Table Cleared" (seating state only, no capture).
- Build `/tab/[sessionId]/pay`: guest manual pay screen with tax + fee breakdown.
- Build host-leaves-before-group flow (reassign host role, notify new host).
- Build idle-warning toast (10-min threshold).
- Build client heartbeat hook (30-second ping).
- Build `processDepartures()` cron: OPEN→AWAITING_TIP on idle + 2h safety; AWAITING_TIP→CAPTURING at 15-min timeout with 20% default.
- Build `cleanupSessions()` cron with timezone-aware window + DST handling.
- Build hold re-authorization flow in `cleanupSessions()`.
- Build Pending Settlements page `/dashboard/settlements` with all action handlers (Retry/Contact/Force 20%/Write Off/Refund/Request New Card).

**Tests (Stripe test mode)**
- Full flow: NFC → hold → order → departure → AWAITING_TIP → capture.
- Tax in capture: $50 food + $3 tax + $0.25 fee + $10 tip = $63.25 charged.
- `application_fee_amount` = $0.25 (service fee only, not tax, not tip).
- Overflow with prorated fee — two halves sum exactly to total fee.
- Retry on hold failure — second attempt uses different idempotency key.
- Hold re-auth — old PI cancelled, new one replaces it.
- Host leaves early — joiner notified they're new host, session stays open.
- Table Cleared does NOT fire capture — confirmed via Stripe dashboard.
- Pro-rata fee split sums exactly to Stripe's total fee.
- Capture compare-and-swap: simultaneous tip pick + timeout cron → only one capture.

**Deliverable**: full authorize → capture lifecycle. Tax flows correctly. All v5.0 + v5.2 payment behavior verified.

---

### Phase 4: Cash + Printing + Tip Distribution (Week 8)

Goal: full cash flow with receipt printing and drawer opening. Tip pool working.

Relevant modules: `04-kitchen-cash-ops.md`, `02-payments-and-money.md` (tip distribution).

**Work items**
- Build `PrintJob` model + migration.
- Build `generateCashReceiptXml()`, with tax line item and `<PeripheralChannel>1</PeripheralChannel>` for drawer open.
- Build `/api/cloudprint/[deviceId]`: polling endpoint (Node.js runtime).
- Build `/api/cloudprint/[deviceId]/ack`: printer completion callback.
- Build `/dashboard/setup/printer`: register device, copy-URL/secret, test print.
- Build `/api/restaurant/sessions/[id]/cash`: cancel hold, set CASH_PENDING, create PrintJob.
- Build `/api/restaurant/sessions/[id]/cash-collected`.
- Build KDS CASH_PENDING tile variant (red border).
- Build dashboard cash-payment alert (SSE-pushed).
- Build tip pool UI `/dashboard/analytics/tips`:
  - DIRECT mode: per-server tip totals with gross/fee/net columns (§17.9), CSV download.
  - POOL mode: pool total, open/close/distribute flow.
- Build `/api/restaurant/tip-pool/*` routes.
- Build tip distribution settings in setup + legal disclaimer modal (FLSA, §17.3).

**Tests (real Star Micronics mC-Print3)**
- Cash selected → receipt prints → drawer opens.
- Cash collected → session closes → table AVAILABLE.
- POOL mode → tips aggregate → pool closes → CSV shows correct total.
- POOL mode under concurrency: two simultaneous tips → one pool, two entries (partial unique index holds).
- ESC/POS injection test: menu item named `Reuben & Fries` prints correctly without breaking XML.

**Deliverable**: complete cash payment flow. Tip distribution modes working.

---

### Phase 5: Tips + Accounts + Notifications (Week 9)

Goal: tip prompt flow. Optional diner accounts. All notifications.

Relevant modules: `02-payments-and-money.md` (tip prompt), `05-dashboards-ui.md` (account page), `06-security-risks-decisions.md` (notifications).

**Work items**
- Generate VAPID keys. Confirm `web-push` dependency.
- Build tip token signing/verification (`src/lib/tip/tipToken.ts`): HMAC-SHA256, `maxTipCents` cap, 24h expiry.
- Build `/tip/[tipToken]`: one-tap tip screen (18% / 20% / 22% / Custom / No tip) with 20%-default countdown disclosure (§18.3).
- Build AWAITING_TIP session state + cron that advances sessions past the 15-minute window using `TipBehavior` defaults.
- Build unified capture path: one PaymentIntent including resolved tip (§11.4, §18.2). Ensure no separate tip charge exists.
- Build pro-rata fee allocation fields on `TabParticipant`, written from webhook (§17.8).
- Build diner registration + login (separate NextAuth provider).
- Build `/account`: card management, `defaultTipBehavior` preference, idle timeout, default dietary notes.
- Build `/api/diner/payment-method/setup` + confirm routes.
- Build push subscription save.
- Build guest → account migration (`/api/diner/migrate-from-guest`), reuses Stripe Customer.
- Build itemised receipt email via Resend (§18.7: tip on same line as charge).
- Build `/account/history`: past sessions + itemised orders.
- Build all Resend email templates (receipt, tip window opened, capture failed, 3DS link, re-auth failed, staff invite).
- Build Twilio SMS for urgent failures.
- Build quarterly tax report CSV download in analytics.
- Build tip report CSV download in analytics (gross / fee / net columns per §17.9).
- Build service request analytics (response time, volume by type/hour).

**Tests**
- Account holder: zero interaction during meal, one combined capture after tip resolution.
- 20%-default timeout: cron fires capture at minute 15 with 20% applied when no diner response.
- Explicit tip choice: capture fires within seconds of tap, tip included in single PaymentIntent.
- AUTO_20 preference: capture fires at timeout with no push notification sent.
- Table Cleared: table flips to AVAILABLE without firing capture; session continues in AWAITING_TIP.
- Pro-rata fee split: `feeAllocatedTo*` fields sum exactly to Stripe fee (no rounding drift).
- Tax report CSV: columns correct, amounts match Stripe dashboard.
- Guest → account migration: new Diner created, old participant history attached, Stripe Customer reused.
- Appendix E canonical test: $50 meal + $10 tip → $63.25 charged, $9.66 server net, $48.31 restaurant food net, $0.24 WalkOut net, $2.90 PA tax, $2.14 Stripe.

**Deliverable**: zero-friction experience for account holders. All notifications working. Full tip flow. Tax reporting. Guest migration.

---

### Phase 6: PWA + Hardening + First Restaurant (Week 10)

Goal: production-ready. First live Warminster restaurant transacting.

Relevant modules: `06-security-risks-decisions.md`, `00-overview.md` (for onboarding UX).

**Work items**
- Add `manifest.json` + PWA meta tags + service worker (offline menu cache).
- Security audit: rate limiting middleware, input sanitisation, CSP verification.
- Stripe production keys + Apple Pay production merchant domain registration.
- Analytics scaffold: covers today, revenue today, tax collected today, most popular items, owner dashboard overview (§21.7).
- Load test: 20 concurrent sessions on Supabase Realtime.
- Add Sentry (client + server) with PII scrubbing.
- Add Vercel Analytics.
- Build restaurant onboarding wizard: Stripe Connect → tables → menu → tax settings → tip distribution → printer → staff invite → done.
- Write Terms of Service (restaurant bears write-off risk, WalkOut Service Fee disclosed, tip pool legal notice, tip fee-share disclosure per §17.8).
- Write Privacy Policy (US-focused, data retention per §25.9).
- Deploy `walkoutofficial.com` to Vercel production. Supabase production project.
- First restaurant: onboard one Warminster café/bar. Stripe test mode first, then flip to live.
- Film: 90-second demo video (non-technical co-founder leads).

**Tests**
- `security-reviewer` agent runs against every payment-adjacent route.
- `database-reviewer` confirms all required indexes present.
- Manual test plan on first-restaurant hardware: 10 simulated tabs through the full flow.
- 48h soak test in Stripe test mode before going live.

**Deliverable**: live in production. First restaurant transacting. Demo video ready for outreach.

---

### V2 Build (post-launch, after 8+ weeks live)

- AI Inventory Forecasting (all of §20).
- Stripe Terminal (Tap-to-Pay on staff phone, §16.4).
- Epson printer support (ePOS-Print via local agent).
- Direct server tip payouts (Stripe Express per-server).
- Multi-location support.
- Premium restaurant tier ($49/month for advanced analytics + loyalty).
- Staff comp / discount mechanism (per-item void + percent discount with reason code, MANAGER + ADMIN).
- Modifier groups (only if restaurant demand materializes — do not pre-build speculatively).

### V3 Build

- Ingredient-level inventory (bill of materials per menu item).
- Real-time ingredient depletion on each order.
- Gift cards + loyalty programs.
- Native iOS app (UWB proximity).

---

## 28. Appendices

### Appendix A: Dependencies

**Add to PokerPay's `package.json`**:

```json
"stripe":            "^14.x",
"@stripe/stripe-js": "^4.x",
"web-push":          "^3.x",
"decimal.js":        "^10.x"
```

**Remove from PokerPay**:

```json
"@zxing/browser": "^0.1.5",
"@zxing/library": "^0.21.3"
```

**Explicitly NOT adding**:
- `sharp` — Cloudflare Images handles resizing at CDN edge.
- Any WebSocket library — SSE covers all real-time needs.
- `node-cron` — Vercel Cron replaces it.

### Appendix B: Local Development

- Postgres via Docker: `docker compose up postgres` (port 5432).
- `DATABASE_URL=postgresql://walkout:walkout@localhost:5432/walkout_dev`.
- `DIRECT_URL` same as `DATABASE_URL` locally (Supabase uses separate URLs in production for connection pooling).
- Run `npx prisma migrate dev` to apply schema.
- Stripe test mode keys in `.env.local`.
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` during payment development.
- `npm run dev` starts Next.js on `http://localhost:3000`.

### Appendix C: Environment Variables (Complete List)

```
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# NextAuth
NEXTAUTH_SECRET=<32+ char secret>
NEXTAUTH_URL=http://localhost:3000   # or https://walkoutofficial.com

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...   (client-visible)
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# Resend
RESEND_API_KEY=re_...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

# Tip token
TIP_SECRET=<32+ char secret>

# CloudPRNT
CLOUDPRINT_SECRET=<32+ char secret>

# Cron
CRON_SECRET=<32+ char secret>

# Web Push
VAPID_PUBLIC_KEY=...    (client-visible)
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:ops@walkoutofficial.com

# R2 (menu photos)
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=walkout-menu-photos
R2_PUBLIC_URL=https://images.walkoutofficial.com

# Supabase (for Edge SSE routes)
SUPABASE_URL=https://....supabase.co
SUPABASE_ANON_KEY=...        (client-visible, RLS-gated)
SUPABASE_SERVICE_ROLE_KEY=...   (server-only)

# Gemini (v2)
GEMINI_API_KEY=...
```

All secrets are 32+ characters. Generate with `openssl rand -base64 32`. Never commit to git. `.env.example` in the repo has every variable name with empty values.

---

## Implementation notes for agents

- `orchestrator`: the current phase dictates which modules to load when dispatching subtasks. Do not pull Phase 4 CloudPRNT spec into a Phase 1 task.
- All agents: phases ship sequentially. A Phase 3 task that depends on Phase 2 code must assume Phase 2 is complete. If Phase 2 work is actually incomplete, the orchestrator should flag it rather than let downstream agents hallucinate missing APIs.
- `tdd-guide`: tests listed in each phase's "Tests" block are the acceptance criteria. A phase is not complete until those tests are green on a fresh clone of the repo.
