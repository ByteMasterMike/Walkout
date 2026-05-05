# PRD Module 03 — Auth, RBAC & Staff Management

Covers PRD section 14 (Authentication, RBAC & Staff Management).

**Required reading**: `00-overview.md`, `01-architecture-schema.md`.

---

## 14. Authentication, RBAC & Staff Management

### 14.1 Four Identity Tiers

- **Tier 1: Restaurant ADMIN**
  - Underlying record: `Restaurant`
  - Auth: email + bcrypt (12 rounds)
  - NextAuth session payload: `{ restaurantId, role: 'ADMIN' }`
  - Can do everything a MANAGER can, plus: Stripe Connect setup, staff invites, staff revocation, restaurant settings.

- **Tier 2: RestaurantStaff (MANAGER or STAFF)**
  - Underlying record: `RestaurantStaff`
  - Same NextAuth credentials flow as ADMIN
  - Session payload: `{ staffId, restaurantId, role }`
  - MANAGER: floor setup, tip pool distribute, analytics, staff invites (but cannot escalate another user to ADMIN).
  - STAFF: KDS, service requests, "Table Cleared", cash collection. No financial admin.

- **Tier 3: Diner Account (Optional)**
  - Underlying record: `Diner`
  - Separate NextAuth provider from restaurant/staff
  - Session payload: `{ dinerId }`
  - Can: register, set payment method, set tip preferences, see history, migrate from guest.

- **Tier 4: Anonymous Guest**
  - Implemented via httpOnly `tabs_anon` cookie (24h, secure, SameSite=lax)
  - Server-side stored in `AnonSession` table, `TabParticipant.anonToken` references it.
  - No password. Ephemeral per session unless the guest migrates (§11.8).

### 14.2 Staff Invite Flow

```
1. ADMIN opens /dashboard/setup/staff, enters email + name + role.
2. POST /api/restaurant/staff/invite
   → Creates RestaurantStaff with inviteStatus = PENDING, isActive = false.
   → Generates inviteToken (UUID v4, single-use, expires 72h).
   → Resend sends:
     Subject: "You've been invited to join [Restaurant] on WalkOut"
     Body:    "[Accept Invite]" linking to /auth/staff/invite/[token]
3. Invitee clicks link → /auth/staff/invite/[token]:
   → Server validates: token exists, not expired, inviteStatus = PENDING.
   → Renders "Set password" form.
   → On submit:
     → bcrypt hash password,
     → set inviteStatus = ACCEPTED, acceptedAt = now(),
     → isActive = true,
     → invalidate inviteToken (set to null),
     → sign the user in via NextAuth.
4. Subsequent uses of the same token return 401.

KDS setup (separate):
1. ADMIN creates a RestaurantStaff with:
     isKdsDevice = true
     role = STAFF
     kdsDevicePin = '4321'  (optional 4-digit)
     no email invite — the password is set directly by ADMIN.
2. The kitchen tablet logs in once and stays logged in permanently.
3. /dashboard/kitchen becomes the home screen.
```

### 14.3 Middleware

```typescript
// src/middleware.ts
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Dashboard = restaurant/staff auth
  if (path.startsWith('/dashboard')) {
    const session = await getServerSession()
    if (!session?.restaurantId) return NextResponse.redirect(new URL('/login', req.url))

    // ADMIN-only protections
    if (path.includes('/setup/stripe') || path.includes('/staff/')) {
      if (session.role !== 'ADMIN') return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // MANAGER+ protections
    if (path.includes('/floor') || path.includes('/tip-pool')) {
      if (session.role !== 'MANAGER' && session.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }
  }

  // Diner / guest surfaces
  if (path.startsWith('/tab') || path.startsWith('/api/sessions')) {
    const anonToken = req.cookies.get('tabs_anon')?.value
    if (anonToken) {
      const headers = new Headers(req.headers)
      headers.set('x-anon-token', anonToken)
      return NextResponse.next({ request: { headers } })
    }
  }

  return NextResponse.next()
}
```

### 14.4 API-Level RBAC

Middleware catches broad path prefixes. Fine-grained access lives on each route. Canonical pattern:

```typescript
// src/app/api/restaurant/.../route.ts
import { requireRole } from '@/lib/auth'

export async function POST(req: Request) {
  const { staffId, restaurantId, role } = await requireRole(req, ['MANAGER', 'ADMIN'])
  // ... business logic, asserting the target resource.restaurantId === restaurantId
}
```

`requireRole` throws 401 if unauthenticated, 403 if role mismatch. Always check `restaurantId` matches the target resource's `restaurantId` (cross-tenant guard). For diner routes, check `dinerId` matches the target.

### 14.5 Cross-Tenant Guard

Every `/api/restaurant/**` query that references an ID from the URL must verify the resource belongs to the authenticated user's restaurant.

```typescript
// BAD — cross-tenant data leak
const session = await prisma.tabSession.findUnique({ where: { id: sessionIdFromUrl } })

// GOOD
const session = await prisma.tabSession.findFirst({
  where: { id: sessionIdFromUrl, restaurantId: authenticatedRestaurantId }
})
if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```

Use 404, not 403, to avoid leaking existence. `security-reviewer` will flag any route that skips this.

### 14.6 KDS Device PIN (v5.0)

KDS tablets stay permanently authenticated. Physical removal is a real risk. Mitigations:

- `RestaurantStaff.kdsDevicePin` — optional 4-digit PIN. When set, the KDS prompts for the PIN before **destructive** actions only (cancel an order, delete a tile, clear a table).
- PIN is stored hashed (bcrypt). Never transmitted to the client.
- Verify server-side via `POST /api/restaurant/kds/verify-pin` with rate limit (5 attempts per 15 min per staff record).
- ADMIN can remotely revoke a KDS session via `POST /api/restaurant/staff/[id]/kds-logout`. On next poll the KDS receives a 401 and redirects to login.

### 14.7 Session Lifetime

- Staff / Admin / Diner sessions: NextAuth JWT, 30-day rolling expiry, refresh on each request.
- KDS device sessions: no expiry (revoke-only model). This is intentional — see §14.6.
- Anonymous `tabs_anon` cookie: 24h. After expiry, a guest returning to their tab must tap NFC again (safe because session will also have expired).

### 14.8 Password Rules

- Minimum 12 characters. No other complexity requirements (NIST 800-63B guidance).
- bcrypt cost 12.
- Common-password deny list: NIST top-10k.
- Passwords never logged, never echoed in responses, never included in error messages.

### 14.9 Staff Revocation

When ADMIN clicks "Remove staff":
1. `RestaurantStaff.isActive = false`.
2. Invalidate all NextAuth sessions for that `staffId`.
3. Any `TableAssignment` with that `staffId` stays in history (onDelete: SetNull ensures tip attribution records survive).
4. Any open `TabSession` with that `assignedStaffId` keeps the reference in its historical record; new sessions at the same table get the new assignment.

Revocation is reversible via `isActive = true`, but the `RestaurantStaff` row is never deleted — deletion would cascade into history and lose tip attribution records.

---

## RBAC Matrix (Quick Reference)

| Surface | DINER | STAFF | MANAGER | ADMIN |
|---|---|---|---|---|
| Tap NFC, open tab | ✓ | (own account) | (own account) | (own account) |
| Order food | ✓ | ✓ (on own session) | ✓ | ✓ |
| Pay & leave | ✓ | ✓ | ✓ | ✓ |
| /dashboard/kitchen (KDS) | ✗ | ✓ | ✓ | ✓ |
| /dashboard/tables (live grid) | ✗ | ✓ | ✓ | ✓ |
| /dashboard/requests (service queue) | ✗ | ✓ | ✓ | ✓ |
| Advance KDS tile status | ✗ | ✓ | ✓ | ✓ |
| Acknowledge service request | ✗ | ✓ | ✓ | ✓ |
| "Table Cleared" | ✗ | ✓ | ✓ | ✓ |
| "Cash Collected" | ✗ | ✓ | ✓ | ✓ |
| /dashboard/menu (CRUD) | ✗ | ✗ | ✓ | ✓ |
| /dashboard/floor (Floor Setup) | ✗ | ✗ | ✓ | ✓ |
| /dashboard/analytics | ✗ | ✗ | ✓ | ✓ |
| Tip pool distribute | ✗ | ✗ | ✓ | ✓ |
| Pending Settlements actions | ✗ | ✗ | ✓ | ✓ |
| /dashboard/setup/staff (invite) | ✗ | ✗ | ✓ (can only add STAFF) | ✓ |
| Revoke staff | ✗ | ✗ | ✓ (STAFF only) | ✓ |
| Escalate to ADMIN | ✗ | ✗ | ✗ | ✗ (not a pattern — ADMIN = Restaurant record) |
| /dashboard/setup/stripe | ✗ | ✗ | ✗ | ✓ |
| Restaurant settings (tax, fees) | ✗ | ✗ | ✗ | ✓ |
| Remote KDS logout | ✗ | ✗ | ✗ | ✓ |

---

## Implementation notes for agents

- `security-reviewer`: every `/api/restaurant/**` and `/api/diner/**` route must pass the cross-tenant guard (§14.5). Missing guard is CRITICAL.
- `code-reviewer`: NextAuth session callbacks must include `restaurantId` and `role` claims. Missing claims means middleware has nothing to check.
- Password / token / PIN handling: hashing, expiry, single-use enforcement. Never use `===` on a password — use `bcrypt.compare`.
- KDS auth is unique: permanent session, optional PIN, remote-revocable. Don't confuse it with normal staff login.
