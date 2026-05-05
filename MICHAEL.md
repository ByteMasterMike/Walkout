# MICHAEL.md — WalkOut (Technical Lead · Cursor)

Operating manual for **Michael** using **Cursor**. The PRD under `docs/prd/` is the source of truth for **what** to build. **`CURSOR.md`** is the cofounder playbook (parallel rules, onboarding tone). **`MICHAEL.md`** is your technical lead reference: formal agent roster conventions, PRD module index, migration ownership, and the **complete** payment-invariants checklist reviewers use.

## Project

WalkOut: NFC-based "authorize on arrival, capture-on-departure" restaurant operating system. Forked from `ByteMasterMike/PokerPay`. Launch in Warminster, PA. Domain `walkoutofficial.com`. Built by Michael (technical) and one business/ops cofounder — see `WORKING-TOGETHER.md`.

## Stack

Next.js 16 on Vercel · Supabase Postgres via Prisma · Supabase Realtime + SSE (Edge runtime, SSE only) · NextAuth v5 · Stripe Connect + Stripe.js · Cloudflare R2 · Star CloudPRNT · Resend + Twilio · Web Push (VAPID) · Gemini (v2) · One Vercel Cron (`/api/cron/maintenance`, 5-min) · `decimal.js` for all money math.

## Cursor workflow

- Agents live under **`.cursor/agents/`** only — there is no parallel Claude Code subtree in this repo.
- Invoke specialists with **`@agentName`** in Cursor (Chat, Composer, or Agent mode), e.g. `@orchestrator`, `@database-reviewer`.
- **No Task-tool dispatch.** Delegate by running a follow-up turn with `@specialist`, or paste the orchestrator plan and execute steps yourself — same outcome, explicit control.

## Migration ownership

**You own** Prisma schema design and **`npx prisma migrate dev`** on the canonical branch. The cofounder requests schema changes via the agreed channel; they do not merge divergent migration histories. See `CURSOR.md` and `WORKING-TOGETHER.md`.

## Seven Architectural Rules (PRD section 7.2 — non-negotiable)

1. **Prisma on Node.js only. Supabase JS client on Edge.** SSE routes use `runtime = 'edge'`; never import Prisma there.
2. **One cron job.** `/api/cron/maintenance` with three internal functions: `processDepartures()`, `cleanupSessions()` (3:00–3:05 AM America/New_York, DST-aware), `generateWeeklyForecasts()` (v2).
3. **Supabase Realtime is the pub/sub layer.** No in-memory EventEmitter, no Redis in v1.
4. **Price AND tax snapshotted on `OrderItem` at order time.** Mid-session menu/tax changes do not touch existing orders.
5. **Money never sits in WalkOut's Stripe account.** Stripe Connect routes to the restaurant; `application_fee_amount` per transaction.
6. **Tax on food subtotal only.** Service fee is 0.5% of pre-tax food, NOT on tax/tip/service-requests. Stripe processes the full amount including tax — unavoidable.
7. **All money math in `Decimal`, never `float`.** Convert to integer cents only at the final Stripe call.

## Payment Invariants (v5.2)

These are tests every money-touching change must pass.

- **One charge per tab.** Capture fires after tip is resolved; tip is in the single combined PaymentIntent. No two-charge model.
- **20% default tip** at the 15-minute `AWAITING_TIP` timeout. "No tip" is a first-class option that fires capture immediately at $0.
- **"Table Cleared" never fires capture** — seating state is independent of payment state (section 11.6).
- **Pro-rata fee allocation (section 17.8).** Tip fee share = `(tip / total) × total_fee`. Write `feeAllocatedTo*Cents` at capture.
- **Floor-then-remainder overflow prorating.** `holdFee = floor(appFee × hold / total)`; `overflowFee = appFee − holdFee`. Sum must equal `appFee` exactly. Never round both halves.
- **Idempotency keys include attempt counter.** `hold-${pid}-${holdAttempt}`, `capture-${pid}-${captureAttempt}`, etc. Increment BEFORE the Stripe call.
- **Webhook uses `req.text()` before parsing.** Body-parsing middleware breaks signature verification.
- **Hold re-auth capped at 3 attempts.** After three failures: `holdStatus = EXPIRED`, flag for human review, never auto-capture.

## Code Standards

- TypeScript strict, no `any` without `// eslint-disable` and a written justification.
- Files 200–400 lines, 800 max. Split by feature/domain.
- Immutability: spread/`map`/`filter`, not in-place mutation.
- Zod-validate every API route input at the boundary.
- No `console.log` in committed code, no emojis in source, no hardcoded secrets.
- Always generate console output in throwaway/investigation scripts.

## Testing

TDD is **mandatory** for `src/lib/payment/`, `src/lib/tax/`, `src/lib/tip/`, `src/app/api/webhooks/stripe/`, and the cron. Failing test first. Stripe test mode for integration tests, never live. Concurrency tests for tip pool creation. Invoke **`@tdd-guide`** before writing money code.

## Git & PRs

- **Trunk-based**: short branches off `main`, merged in 2–24 hours.
- **One module per branch**: a branch touches one PRD module's surface area. Cross-module work splits into two branches.
- **`@code-reviewer`** on every PR before merge, no exceptions. **`@security-reviewer`** on payments/auth/webhooks/tokens. **`@database-reviewer`** on every migration.
- Conventional Commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Detail in `BRANCHING.md`. Day-to-day workflow in `WORKING-TOGETHER.md`.

## Agent Roster

Definitions in **`.cursor/agents/`**. Use **`@mentions`** — never overload a single conversation when a specialist fits better.

| Agent | Use for |
|---|---|
| `@orchestrator` | Multi-domain features. Decomposes, recommends specialists, synthesizes. |
| `@code-reviewer` | Every PR before merge. |
| `@security-reviewer` | Payments, auth, tokens, webhooks, RBAC, guest migration. |
| `@database-reviewer` | Every Prisma migration and schema change. |
| `@build-error-resolver` | Build/typecheck/Prisma errors. |
| `@code-explorer` | Read-only subsystem mapping before unfamiliar work. |
| `@tdd-guide` | New logic in money paths. Failing test first. |

## PRD Modules

Source of truth for what to build. Load only what the task needs.

- `00-overview.md` — read by everyone
- `01-architecture-schema.md` — rules, Prisma, API, SSE
- `02-payments-and-money.md` — capture, tax, tips, fee allocation
- `03-auth-staff-rbac.md` — NextAuth, RBAC, invites
- `04-kitchen-cash-ops.md` — KDS, CloudPRNT, service requests
- `05-dashboards-ui.md` — dashboard, diner PWA, notifications
- `06-security-risks-decisions.md` — security spec, risks, decisions log
- `07-build-plan.md` — phased plan, dependencies, env vars

## Current Phase

**Phase 1: Foundation + RBAC, Weeks 1–2.** NFC tap → join → open tab. RBAC. Race-condition-safe session creation. See `07-build-plan.md`. Do not start Phase 3 payment code until Phases 1 and 2 deliverables are green.

## Working Style

Short paragraphs. Push back when wrong. Confirm claims against primary sources, never invent statistics or phantom citations.

## When in Doubt

PRD wins over this file. If the PRD is silent, decide or sync with cofounder intentionally. If the PRD contradicts itself, flag it — that is a real bug.
