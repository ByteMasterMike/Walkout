# PRD Module 01 — Architecture & Schema

Covers PRD sections 6 (Proximity & Hardware), 7 (Architecture Overview), 8 (Database Schema), 9 (API Design), 10 (Real-Time).

**Read with**: `00-overview.md` (always) and whichever feature module you are implementing.

---

## 6. Proximity Technology & Hardware Ecosystem

### 6.1 Proximity: NFC NDEF URL Tags

**Decision**: NFC NDEF URL tags. Pre-programmed by WalkOut, shipped with the onboarding kit.

Each table gets one sticker programmed with:

```
https://walkoutofficial.com/join/[nfcTagId]
```

- **iOS 14+**: Safari opens automatically. No app. No scan.
- **Android**: Chrome opens automatically.
- Zero JavaScript required. NFC tag hardware handles the redirect.
- **QR fallback**: same URL as a QR code via the existing `qrcode` library. Printed card at table.

### 6.2 UWB — Future Native App (Not This Product)

UWB is only accessible via Apple's `NearbyInteraction` iOS framework. No Web API. "Switching to UWB" means building a separate native iOS app. Future roadmap item, not v1 or v2. The web app is the long-term product.

### 6.3 Hardware Ecosystem (BYOD)

**NFC stickers (WalkOut ships)**: Waterproof PET, adhesive, 30mm diameter. Pre-programmed.

**Amazon shopping list (restaurant sources)**:
- KDS tablet: Samsung Galaxy Tab A9+ (~$219) budget / iPad 10th gen (~$349) premium.
- Receipt printer: **Star Micronics mC-Print3** (~$299), CloudPRNT-enabled. **Required.**
- Cash drawer: Star Micronics CD3-1616 (~$89), RJ-12 to printer. Opens via ESC/POS `ESC p`.
- Staff floor tablet (optional): any Android/iOS tablet with Chrome/Safari.

**NOT supported in v1**: Epson TM-T88VI (ePOS-Print protocol, requires same LAN). v2 via local agent.

Total hardware investment: ~$607–$937 vs. Toast's $627–$1,200+.

---

## 7. Architecture Overview

### 7.1 System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌──────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  Restaurant      │  │  KDS Screen    │  │  Diner PWA     │    │
│  │  Dashboard       │  │  /kitchen      │  │  /join /tab    │    │
│  │  ADMIN/MGR/STAFF │  │  STAFF auth,   │  │  /tip /account │    │
│  │                  │  │  fixed device  │  │                │    │
│  └──────────────────┘  └────────────────┘  └────────────────┘    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ HTTPS + SSE
┌────────────────────────────────▼─────────────────────────────────┐
│                    NEXT.JS 16 APP (Vercel)                       │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  App Router  │  │  API Routes     │  │  SSE Streams        │  │
│  │  Pages/Layout│  │  (Node.js)      │  │  (Edge Runtime)     │  │
│  └──────────────┘  └─────────────────┘  └─────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  NextAuth v5                                             │    │
│  │  Restaurant ADMIN · RestaurantStaff · Diner · AnonCookie │    │
│  └──────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────┐
│  Supabase Postgres + Realtime │ Prisma ORM │ Cloudflare R2       │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────┐
│  Stripe Connect │ Star CloudPRNT │ Resend │ Twilio │             │
│  Web Push │ Gemini AI (v2) │ Vercel Cron (1 job)                 │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 Non-Negotiable Architectural Rules

**These seven rules will break production if violated. No exceptions without explicit PRD update.**

1. **Prisma on Node.js only. Supabase JS client on Edge.** SSE routes use `export const runtime = 'edge'` and import from `@/lib/supabase`. All other routes use Prisma on default Node.js Serverless. NEVER import Prisma in an edge route.

2. **One Vercel Cron job.** `/api/cron/maintenance` runs every 5 minutes. Contains three functions:
   - `processDepartures()` — always
   - `cleanupSessions()` — 3:00–3:05 AM America/New_York only, with DST handled in the function
   - `generateWeeklyForecasts()` — v2, on configured forecast day only

3. **Supabase Realtime is the pub/sub layer.** Multiple Vercel instances run simultaneously. In-memory EventEmitter fails across instances. Supabase Realtime broadcasts Postgres row changes to SSE subscribers. Zero additional infrastructure.

4. **Price AND tax snapshotted on `OrderItem` at order time.** When a diner adds an item, `unitPrice`, `taxRate`, and `taxAmount` are copied from `MenuItem` / `Restaurant` onto `OrderItem`. Menu price changes or tax rate changes mid-session do not affect active orders.

5. **Money never sits in WalkOut's Stripe account.** Stripe Connect routes all payments directly to the restaurant's connected account. WalkOut takes `application_fee_amount` per transaction.

6. **Tax is calculated on food subtotal only.** Tax base = pre-tax food subtotal. WalkOut service fee = 0.5% of pre-tax subtotal (NOT on tax). Tip suggestions = percentage of pre-tax subtotal (US etiquette norm). Service requests are excluded from the tax base and the service fee base. Stripe processes the full amount including tax. This is unavoidable with any payment processor.

7. **All money math uses `Decimal`, not `float`.** Convert to integer cents only at the final Stripe API call. Every intermediate calculation (subtotal, tax, service fee, tip) stays in `Decimal` to prevent penny-level rounding drift.

---

## 8. Database Schema (Complete)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ================================================================
// ENUMS
// ================================================================

enum UserRole { DINER STAFF MANAGER ADMIN }

enum TableStatus { AVAILABLE OCCUPIED CLOSING }

enum SessionStatus { OPEN CLOSING CLOSED ABANDONED }

enum HoldStatus {
  NONE PENDING HELD FAILED RELEASED EXPIRED
  REAUTHORIZING   // v5.0: hold is being refreshed before 7-day expiry
}

enum CaptureStatus { PENDING PROCESSING CAPTURED FAILED SKIPPED }

enum PaymentStatus { NOT_STARTED PROCESSING PAID FAILED REFUNDED }

enum TipBehavior {
  // v5.2: unified tip resolution. All sessions enter AWAITING_TIP after departure;
  // this enum controls what happens during the 15-minute window.
  ASK          // Prompt the diner. Apply 20% default on timeout. (default for guests)
  AUTO_18
  AUTO_20
  AUTO_22
  AUTO_NONE    // Apply $0 automatically on timeout, no prompt.
}

enum TipSource {
  // v5.2: audit trail for how the tip was resolved. Written at capture.
  DINER_CHOICE
  DINER_DECLINED
  TIMEOUT_DEFAULT
  AUTO_PREF
}

enum TipStatus {
  // v5.2 simplification.
  NOT_APPLICABLE
  AWAITING
  RESOLVED
}

enum TipDistributionMode { DIRECT POOL }
enum TipPoolStatus { OPEN CLOSED DISTRIBUTED }

enum DepartureSource { DINER_SELF STAFF_CLEARED IDLE_TIMEOUT FORCE_TIMEOUT }

enum OrderItemStatus { PENDING CONFIRMED PREPPING SERVED CANCELLED CASH_PENDING }

enum PrintStatus { QUEUED SENT PRINTED FAILED }
enum PrintType { CASH_RECEIPT ORDER_TICKET }

enum InviteStatus { PENDING ACCEPTED EXPIRED }

enum ForecastStatus { DRAFT REVIEWED ORDERED }
enum StockAlertType { LOW_STOCK PROJECTED_STOCKOUT HIGH_WASTE FORECAST_READY }

// v5.0
enum ServiceRequestType {
  WATER REFILL SILVERWARE EXTRA_PLATE TOGO_CONTAINER
  HIGH_CHAIR CLEAR_TABLE SPEAK_TO_SERVER CLOSE_TAB
}
enum ServiceRequestStatus { OPEN ACKNOWLEDGED RESOLVED CANCELLED }

// ================================================================
// RESTAURANT
// ================================================================

model Restaurant {
  id                        String    @id @default(uuid())
  name                      String
  email                     String    @unique
  passwordHash              String
  logoUrl                   String?
  address                   String?
  city                      String?
  state                     String?
  zipCode                   String?
  phone                     String?
  currency                  String    @default("USD")

  timezone                  String    @default("America/New_York")

  // Tax
  taxRate                   Decimal   @db.Decimal(5, 4) @default(0.0600)
  taxLabel                  String    @default("Sales Tax")
  taxEnabled                Boolean   @default(true)

  // Payment
  defaultHoldAmount         Int       @default(7500)        // $75
  idleTimeoutMinutes        Int       @default(15)

  // WalkOut platform fee (v5.0: 0.5% flat, flat-cents retained at 0)
  walkOutServiceFeePercent  Decimal   @db.Decimal(5, 4) @default(0.0050)
  walkOutServiceFeeFlat     Int       @default(0)

  // Stripe Connect
  stripeConnectAccountId    String?
  stripeConnectOnboarded    Boolean   @default(false)

  // Tip distribution
  tipDistributionMode       TipDistributionMode @default(DIRECT)
  tipPoolDisclaimerAt       DateTime?
  absorbTipProcessingFee    Boolean   @default(false)  // v5.2: see §17.8

  // CloudPRNT
  cloudPrintDeviceId        String?
  cloudPrintEnabled         Boolean   @default(false)

  // Staff onboarding
  inviteCode                String    @unique @default(uuid())

  // Inventory & forecasting (v2)
  inventoryEnabled          Boolean   @default(false)
  forecastDayOfWeek         Int       @default(4)
  forecastEmailEnabled      Boolean   @default(false)
  forecastEmailTo           String?

  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt

  tables            DiningTable[]
  staff             RestaurantStaff[]
  menuCategories    MenuCategory[]
  menuItems         MenuItem[]
  sessions          TabSession[]
  printJobs         PrintJob[]
  tableAssignments  TableAssignment[]
  tipPools          TipPool[]
  inventoryItems    InventoryItem[]
  stockDeliveries   StockDelivery[]
  stockCounts       StockCount[]
  weeklyForecasts   WeeklyForecast[]
  stockAlerts       StockAlert[]
  serviceRequests   ServiceRequest[]

  @@map("restaurants")
}

model RestaurantStaff {
  id                     String        @id @default(uuid())
  restaurantId           String
  restaurant             Restaurant    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  email                  String        @unique
  name                   String
  passwordHash           String?
  role                   UserRole

  isActive               Boolean       @default(true)
  inviteToken            String?       @unique
  inviteStatus           InviteStatus  @default(PENDING)
  invitedAt              DateTime      @default(now())
  acceptedAt             DateTime?

  isKdsDevice            Boolean       @default(false)
  kdsDevicePin           String?       // v5.0: optional 4-digit PIN for destructive actions

  stripeExpressAccountId String?

  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt

  tableAssignments       TableAssignment[]
  sessions               TabSession[]  @relation("AssignedStaff")
  acknowledgedRequests   ServiceRequest[] @relation("AckedBy")

  @@index([restaurantId])
  @@index([email])
  @@map("restaurant_staff")
}

model TableAssignment {
  id            String           @id @default(uuid())
  restaurantId  String
  restaurant    Restaurant       @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  tableId       String
  table         DiningTable      @relation(fields: [tableId], references: [id])

  staffId       String
  staff         RestaurantStaff  @relation(fields: [staffId], references: [id])

  assignedAt    DateTime         @default(now())
  endedAt       DateTime?
  isActive      Boolean          @default(true)

  @@index([tableId, isActive])
  @@index([restaurantId, isActive])
  @@map("table_assignments")
}

model DiningTable {
  id             String        @id @default(uuid())
  restaurantId   String
  restaurant     Restaurant    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  tableNumber    String
  nfcTagId       String        @unique @default(uuid())
  qrCodeUrl      String?
  isActive       Boolean       @default(true)
  status         TableStatus   @default(AVAILABLE)

  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  sessions       TabSession[]
  assignments    TableAssignment[]

  @@index([restaurantId])
  @@index([nfcTagId])
  @@map("dining_tables")
}

model MenuCategory {
  id           String      @id @default(uuid())
  restaurantId String
  restaurant   Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  name         String
  sortOrder    Int         @default(0)
  isVisible    Boolean     @default(true)

  items        MenuItem[]

  @@index([restaurantId])
  @@map("menu_categories")
}

model MenuItem {
  id            String         @id @default(uuid())
  restaurantId  String
  restaurant    Restaurant     @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  categoryId    String?
  category      MenuCategory?  @relation(fields: [categoryId], references: [id])

  name          String
  description   String?
  price         Decimal        @db.Decimal(10, 2)
  imageUrl      String?
  isAvailable   Boolean        @default(true)
  allergens     String[]       @default([])
  isPopular     Boolean        @default(false)
  sortOrder     Int            @default(0)

  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  orderItems    OrderItem[]
  inventoryItem InventoryItem?

  @@index([restaurantId])
  @@index([restaurantId, isPopular])  // Featured Items query
  @@map("menu_items")
}

model TabSession {
  id                 String            @id @default(uuid())
  tableId            String
  table              DiningTable       @relation(fields: [tableId], references: [id])

  restaurantId       String
  restaurant         Restaurant        @relation(fields: [restaurantId], references: [id])

  status             SessionStatus     @default(OPEN)
  hostParticipantId  String?

  assignedStaffId    String?
  assignedStaff      RestaurantStaff?  @relation("AssignedStaff", fields: [assignedStaffId], references: [id], onDelete: SetNull)

  // v5.2: seating state is independent of payment state
  clearedByStaff     Boolean           @default(false)
  clearedAt          DateTime?
  seatingClearedAt   DateTime?
  clearedByStaffId   String?

  // Idle tracking
  lastHeartbeatAt    DateTime?

  createdAt          DateTime          @default(now())
  closedAt           DateTime?
  updatedAt          DateTime          @updatedAt

  participants       TabParticipant[]
  orders             OrderItem[]
  serviceRequests    ServiceRequest[]

  @@index([tableId, status])
  @@index([restaurantId, status])
  @@map("tab_sessions")
}

model TabParticipant {
  id                         String           @id @default(uuid())
  sessionId                  String
  session                    TabSession       @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  dinerId                    String?
  diner                      Diner?           @relation(fields: [dinerId], references: [id])
  anonToken                  String?

  displayName                String
  isHost                     Boolean          @default(false)

  dietaryNotes               String?  // participant-level, prepended to KDS tickets

  // Payment hold
  stripeCustomerId           String?
  stripePaymentMethodId      String?
  stripePaymentIntentId      String?
  holdAmount                 Int?
  holdStatus                 HoldStatus       @default(NONE)

  // v5.0: idempotency attempt counters
  holdAttempt                Int              @default(0)
  captureAttempt             Int              @default(0)
  overflowAttempt            Int              @default(0)
  reauthCount                Int              @default(0)

  // Capture
  captureStatus              CaptureStatus    @default(PENDING)
  capturedAmount             Int?
  capturedAt                 DateTime?

  // Overflow (bill > hold)
  overflowAmount             Int?
  overflowPaymentIntentId    String?
  overflowStatus             CaptureStatus    @default(PENDING)

  // Component cents
  serviceFeeCents            Int?
  taxCents                   Int?
  subtotalCents              Int?

  // Cash
  isCashPayment              Boolean          @default(false)
  cashCollectedAt            DateTime?
  cashCollectedByStaffId     String?

  // Manual payment (guests, backup)
  manualPaymentIntentId      String?
  manualPaymentStatus        PaymentStatus    @default(NOT_STARTED)

  // Tip (v5.2 unified)
  tipBehavior                TipBehavior      @default(ASK)
  resolvedTipAmount          Int?
  resolvedTipSource          TipSource?
  awaitingTipSince           DateTime?
  tipStatus                  TipStatus        @default(NOT_APPLICABLE)
  tipPromptSentAt            DateTime?
  tipPromptToken             String?          @unique

  // v5.2: pro-rata fee allocation (§17.8)
  feeAllocatedToFoodCents       Int @default(0)
  feeAllocatedToTipCents        Int @default(0)
  feeAllocatedToServiceFeeCents Int @default(0)
  feeAllocatedToTaxCents        Int @default(0)

  // Tip attribution
  tipAssignedToStaffId       String?
  tipAssignedToStaff         RestaurantStaff? @relation("TipAssignedTo", fields: [tipAssignedToStaffId], references: [id], onDelete: SetNull)
  tipPoolId                  String?
  tipPool                    TipPool?         @relation(fields: [tipPoolId], references: [id])

  joinedAt                   DateTime         @default(now())
  departedAt                 DateTime?
  updatedAt                  DateTime         @updatedAt

  orders                     OrderItem[]
  serviceRequests            ServiceRequest[]

  @@index([sessionId])
  @@index([dinerId])
  @@index([stripeCustomerId])
  @@index([captureStatus])
  @@map("tab_participants")
}

model OrderItem {
  id             String           @id @default(uuid())
  sessionId      String
  session        TabSession       @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  participantId  String
  participant    TabParticipant   @relation(fields: [participantId], references: [id], onDelete: Cascade)

  menuItemId     String
  menuItem       MenuItem         @relation(fields: [menuItemId], references: [id])

  // SNAPSHOTS at order time (Rule 4)
  unitPrice      Decimal          @db.Decimal(10, 2)
  taxRate        Decimal          @db.Decimal(5, 4)
  taxAmount      Decimal          @db.Decimal(10, 2)
  quantity       Int              @default(1)

  notes          String?
  status         OrderItemStatus  @default(PENDING)

  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@index([sessionId])
  @@index([status])
  @@map("order_items")
}

model Diner {
  id                            String    @id @default(uuid())
  email                         String    @unique
  name                          String
  passwordHash                  String
  phone                         String?

  stripeCustomerId              String?   @unique
  stripeDefaultPaymentMethodId  String?
  autoChargeEnabled             Boolean   @default(false)

  defaultTipBehavior            TipBehavior @default(ASK)
  defaultIdleTimeoutMinutes     Int?
  defaultDietaryNotes           String?

  pushSubscription              Json?

  createdAt                     DateTime  @default(now())
  updatedAt                     DateTime  @updatedAt

  participants                  TabParticipant[]

  @@map("diners")
}

model AnonSession {
  id         String    @id @default(uuid())
  token      String    @unique
  mergedInto String?
  expiresAt  DateTime
  createdAt  DateTime  @default(now())

  @@index([expiresAt])
  @@map("anon_sessions")
}

// Tip pooling
model TipPool {
  id                  String          @id @default(uuid())
  restaurantId        String
  restaurant          Restaurant      @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  status              TipPoolStatus   @default(OPEN)
  shiftDate           DateTime        @default(now())
  totalAmountCents    Int             @default(0)

  entries             TipPoolEntry[]
  participants        TabParticipant[]

  createdAt           DateTime        @default(now())
  closedAt            DateTime?
  distributedAt       DateTime?

  @@index([restaurantId, status])
  @@map("tip_pools")
}

model TipPoolEntry {
  id             String           @id @default(uuid())
  poolId         String
  pool           TipPool          @relation(fields: [poolId], references: [id], onDelete: Cascade)

  participantId  String
  staffId        String?
  staff          RestaurantStaff? @relation("TipPoolEntryStaff", fields: [staffId], references: [id], onDelete: SetNull)
  amountCents    Int

  createdAt      DateTime         @default(now())

  @@index([poolId])
  @@map("tip_pool_entries")
}

// CloudPRNT
model PrintJob {
  id            String      @id @default(uuid())
  restaurantId  String
  restaurant    Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  type          PrintType
  status        PrintStatus @default(QUEUED)
  content       Bytes       // ESC/POS bytes
  metadata      Json

  createdAt     DateTime    @default(now())
  sentAt        DateTime?
  printedAt     DateTime?
  failedAt      DateTime?

  @@index([restaurantId, status])
  @@map("print_jobs")
}

// v5.0: Service Requests — routed to floor, NOT KDS, excluded from tax/fee
model ServiceRequest {
  id              String               @id @default(uuid())
  sessionId       String
  session         TabSession           @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  participantId   String
  participant     TabParticipant       @relation(fields: [participantId], references: [id], onDelete: Cascade)

  restaurantId    String
  restaurant      Restaurant           @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  type            ServiceRequestType
  status          ServiceRequestStatus @default(OPEN)
  notes           String?

  acknowledgedAt  DateTime?
  acknowledgedById String?
  acknowledgedBy  RestaurantStaff?     @relation("AckedBy", fields: [acknowledgedById], references: [id], onDelete: SetNull)
  resolvedAt      DateTime?

  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@index([sessionId, status])
  @@index([restaurantId, status])
  @@map("service_requests")
}

// Inventory models (v2) — see docs/prd/07-build-plan.md for when to implement
// model InventoryItem, StockDelivery, StockCount, WeeklyForecast, StockAlert
// Schemas in the canonical PRD; stubbed here so v1 migrations don't reference undefined models.
```

### Partial Unique Indexes (must be in migration SQL, not schema.prisma)

Prisma cannot express partial uniques. Add via raw SQL in the migration:

```sql
-- At most one active session per table
CREATE UNIQUE INDEX one_active_session_per_table
  ON tab_sessions (table_id)
  WHERE status IN ('OPEN', 'CLOSING');

-- At most one OPEN tip pool per restaurant
CREATE UNIQUE INDEX one_open_pool_per_restaurant
  ON tip_pools (restaurant_id)
  WHERE status = 'OPEN';
```

Both are mandatory. Without them, two simultaneous NFC taps produce two sessions and two simultaneous tips produce two pools.

---

## 9. API Design

### Conventions

- All routes except SSE and webhooks use Node.js runtime.
- SSE routes: `export const runtime = 'edge'`, Supabase JS client, no Prisma.
- All route bodies validated with Zod.
- Authenticated routes read session via NextAuth; anonymous diner routes read `x-anon-token` header set by middleware from the `tabs_anon` cookie.
- Rate limits per §25.8.

### Public (Diner-facing)

```
POST   /api/join/[nfcTagId]
  → Resolves NFC → table → restaurant, creates or joins TabSession,
    creates TabParticipant (guest with anonToken OR diner via NextAuth).
  → Returns { sessionId, participantId, nextStep: 'payment' | 'tab' }.

POST   /api/sessions/[sessionId]/hold
  → Place auth hold. Increments participant.holdAttempt, uses key
    `hold-${participantId}-${holdAttempt}`.
  → Returns { status, clientSecret? } (clientSecret if 3DS required).

POST   /api/sessions/[sessionId]/heartbeat
  → { participantId } body. Updates session.lastHeartbeatAt.

POST   /api/sessions/[sessionId]/orders
  → Body validated via Zod. Creates OrderItem with SNAPSHOTTED unitPrice, taxRate, taxAmount.

GET    /api/sessions/[sessionId]
  → Full tab state. Anonymized if viewer is guest.

POST   /api/sessions/[sessionId]/checkout
  → Diner-initiated departure. Moves session OPEN → AWAITING_TIP.
    Sends push notification with tip link.

POST   /api/sessions/[sessionId]/service-requests
  → { type, notes? }. Creates ServiceRequest, broadcasts to floor dashboard.
  → Rate-limited: 20 req/min per participant.

POST   /api/sessions/[sessionId]/pay
  → Guest manual pay (one-shot capture without tip window).
    Fires combined capture using current resolved tip (or 0).

GET    /tip/[tipToken]       (page, not API)
POST   /api/tip/[tipToken]
  → Body: { amountCents } or { decline: true }. Verifies HMAC signature and expiry.
    Writes resolvedTipAmount, resolvedTipSource = DINER_CHOICE | DINER_DECLINED,
    fires capture immediately (compare-and-swap on captureStatus).

GET    /api/sessions/[sessionId]/stream    (SSE, Edge runtime)
  → Supabase Realtime subscription, filtered by sessionId.
```

### Diner account

```
POST   /api/diner/register         — email + password
POST   /api/diner/payment-method/setup
POST   /api/diner/payment-method/confirm
GET    /api/diner/account
PATCH  /api/diner/account          — defaultTipBehavior, dietary, etc.
GET    /api/diner/tabs             — history
POST   /api/diner/migrate-from-guest    — §11.8 transaction
POST   /api/diner/push-subscription
```

### Restaurant / Staff (authenticated via NextAuth)

```
POST   /api/restaurant/register
POST   /api/restaurant/stripe/connect          — ADMIN
POST   /api/restaurant/staff/invite            — ADMIN
POST   /api/restaurant/staff/[id]/revoke       — ADMIN
POST   /api/restaurant/staff/[id]/kds-logout   — ADMIN (remote KDS revoke)

CRUD   /api/restaurant/menu/...                — ADMIN / MANAGER
CRUD   /api/restaurant/tables/...              — ADMIN

POST   /api/restaurant/tables/[id]/assign      — MANAGER+ (Floor Setup §17.6)
POST   /api/restaurant/floor/save              — MANAGER+
POST   /api/restaurant/floor/load-yesterday    — MANAGER+

POST   /api/restaurant/sessions/[id]/clear
  → Staff "Table Cleared". Flips table → AVAILABLE. Sets session.seatingClearedAt.
  → DOES NOT FIRE CAPTURE (v5.2).

POST   /api/restaurant/sessions/[id]/cash
  → Cancels hold, marks CASH_PENDING, creates PrintJob.
POST   /api/restaurant/sessions/[id]/cash-collected

POST   /api/restaurant/orders/[id]/status      — KDS advance
POST   /api/restaurant/service-requests/[id]/ack
POST   /api/restaurant/service-requests/[id]/resolve

GET    /api/restaurant/analytics/tax?range=...
GET    /api/restaurant/analytics/tips?range=...
GET    /api/restaurant/settlements/pending

POST   /api/restaurant/tip-pool/close
POST   /api/restaurant/tip-pool/[id]/distribute

GET    /api/restaurant/stream                  (SSE, Edge)
```

### Webhooks & cron

```
POST   /api/webhooks/stripe
  → Raw `req.text()` BEFORE any parsing (signature verification).
  → Handlers: payment_intent.succeeded, payment_intent.payment_failed,
    payment_intent.requires_action, reauth-type intents.

GET    /api/cron/maintenance
  → CRON_SECRET header required.
  → processDepartures(): OPEN → AWAITING_TIP (idle + 2h safety);
    AWAITING_TIP → CAPTURING (15-min timeout with 20% default).
  → cleanupSessions(): 3:00–3:05 AM America/New_York, DST-aware.
  → generateWeeklyForecasts(): v2.

POST   /api/cloudprint/[deviceId]               — printer polls
POST   /api/cloudprint/[deviceId]/ack           — printer completion callback
```

---

## 10. Real-Time Architecture

### 10.1 SSE over Supabase Realtime

SSE routes run on Edge runtime and subscribe to Supabase Realtime (Postgres CDC). Why not Redis pub/sub: one less service, zero additional infra, fan-out is already provisioned by Supabase.

```typescript
// src/app/api/sessions/[sessionId]/stream/route.ts
export const runtime = 'edge'

import { supabase } from '@/lib/supabase'

export async function GET(req: Request, { params }: { params: { sessionId: string } }) {
  const stream = new ReadableStream({
    start(controller) {
      const channel = supabase
        .channel(`session-${params.sessionId}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'tab_sessions', filter: `id=eq.${params.sessionId}` },
            (payload) => controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`))
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'order_items', filter: `session_id=eq.${params.sessionId}` },
            (payload) => controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`))
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'service_requests', filter: `session_id=eq.${params.sessionId}` },
            (payload) => controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`))
        .subscribe()

      req.signal.addEventListener('abort', () => supabase.removeChannel(channel))
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}
```

### 10.2 Channels

- `session-${sessionId}` — diner PWA, staff dashboard tab detail
- `restaurant-${restaurantId}` — dashboard live table grid, KDS, service request queue
- `table-${tableId}` — auxiliary, for table-specific widgets

### 10.3 Scope channels narrowly

- Diner subscribes to `session-${sessionId}` only. Never to the restaurant channel — that leaks across tables.
- KDS subscribes to `restaurant-${restaurantId}` with a client-side filter that IGNORES service request events (KDS is food-only per §15.1).
- Restaurant stream subscriptions must verify authenticated user's `restaurantId` server-side before establishing the channel.

### 10.4 Mobile SSE reconnection (v5.0)

Mobile browsers throttle backgrounded tabs. Without reconnection logic, a diner returning mid-meal sees stale state.

```typescript
// Client hook
function useSessionStream(sessionId: string) {
  const [state, setState] = useState(null)

  useEffect(() => {
    let source: EventSource | null = null
    let backoff = 1000

    const connect = () => {
      source = new EventSource(`/api/sessions/${sessionId}/stream`)
      source.onmessage = (e) => setState(JSON.parse(e.data))
      source.onerror = () => {
        source?.close()
        // Full re-fetch on reconnect to reconcile missed deltas
        fetch(`/api/sessions/${sessionId}`).then(r => r.json()).then(setState)
        setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 30_000)
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        source?.close()
        backoff = 1000
        connect()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    connect()
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      source?.close()
    }
  }, [sessionId])

  return state
}
```

Applies to `useRestaurantStream` too.

### 10.5 Connection limits

Supabase Realtime: Free 200, Pro 500. At 10 restaurants × 15 tables × staff dashboards + KDS, we approach these.

**Mitigation**: Restaurant dashboard opens one channel per session watched (lazy, not all sessions). Monitor at 400. Plan migration to Upstash Redis pub/sub at 5+ restaurants.

---

## Implementation notes for agents

- `database-reviewer`: every migration is evaluated against this schema. Divergence must be intentional and PRD-updated.
- `code-reviewer`: edge-vs-node runtime violations are CRITICAL, see §7.2 Rule 1.
- `code-explorer`: the entry points here (routes) and the channels here (real-time) are the anchor graph for any subsystem map.
- `tdd-guide`: SSE hook behavior is testable with a mock EventSource. Reconnection-on-visibility is a required test for the client stream hooks.
