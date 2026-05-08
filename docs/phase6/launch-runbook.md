# Phase 6 — Production launch runbook

Operational checklist (no code). Complete in order before pointing production DNS at WalkOut.

## 1. Stripe live cutover

- [ ] In Stripe Dashboard, switch to **Live** mode for final verification only.
- [ ] In Vercel → Project → **Settings → Environment Variables** (Production):
  - [ ] `STRIPE_SECRET_KEY` (live `sk_live_…`)
  - [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live `pk_live_…`)
  - [ ] `STRIPE_WEBHOOK_SECRET` from live webhook endpoint (`whsec_…`)
  - [ ] `STRIPE_CONNECT_CLIENT_ID` if using Connect OAuth (live)
- [ ] Register webhook URL `https://<domain>/api/webhooks/stripe` for live events required by PRD (payment intents, Connect account updates, etc.).
- [ ] Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` **against test** for dev only; for live, use Dashboard-delivered webhooks — disable temporary forwarding when done.

## 2. Apple Pay

- [ ] Stripe → **Settings → Payment methods → Apple Pay** — add production domain `walkoutofficial.com`.
- [ ] Host Apple domain association file at `/.well-known/apple-developer-merchantid-domain-association` (or use Stripe-hosted verification if applicable).

## 3. Supabase / database (production)

- [ ] Dedicated Supabase **production** project; never share DB with staging.
- [ ] Set `DATABASE_URL` in Vercel Production.
- [ ] Run `npx prisma migrate deploy` against production from CI or a trusted operator machine.
- [ ] Seed a single pilot restaurant only if required for smoke tests.

## 4. DNS / TLS

- [ ] Point `walkoutofficial.com` (and `www` if used) to Vercel per their DNS docs.
- [ ] Confirm HTTPS and HSTS (CSP already sets strong defaults in-app).

## 5. 48h soak (test mode or staging)

- [ ] Real devices: full diner flow (join → order → tip → capture); staff dashboards + SSE.
- [ ] Monitor **Sentry** for new error types; triage before live traffic.

## 6. Load test (SSE)

- [ ] From a staging shell with auth cookie / token as documented in `scripts/loadtest.ts` usage:
  - [ ] Target `GET /api/sessions/[id]/stream` or `/api/restaurant/stream` per script — **20 concurrent** connections.
  - [ ] Pass criteria: **&lt;1%** HTTP/SSE errors; **p95** latency **&lt;500ms** for first meaningful chunk (adjust per environment).

## 7. Agent gates (manual)

- [ ] Run **security-reviewer** agent on the Phase 6 PR / merge train.
- [ ] Run **database-reviewer** agent on Prisma migrations and analytics queries.

## 8. First restaurant

- [ ] Complete `/dashboard/onboarding` on their hardware.
- [ ] Run **10 simulated tabs** through full lifecycle (hold → order → tip → close).

## Scripts

- **Load test:** `npm run loadtest` (TypeScript: `scripts/loadtest.ts`) or `node scripts/loadtest.mjs` — see file headers for env vars (`BASE_URL`, `SESSION_ID`, `COOKIE`, etc.).
- **Soak:** use your preferred runner (e.g. autocannon against `GET /api/restaurants/[id]/menu` **without** auth where public).
