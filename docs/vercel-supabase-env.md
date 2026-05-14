# Production environment checklist (Vercel + Supabase)

Use this on **walkoutofficial.com** (or any production host) before expecting dashboard data to persist.

## Required variables (Production + Preview)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase **connection pooler** URI (port **6543**). Include `?pgbouncer=true&connection_limit=1` (or Supabase-recommended query string). |
| `DIRECT_URL` | Supabase **direct** Postgres URI (port **5432**). Used by Prisma Migrate, not for app runtime traffic. |
| `AUTH_SECRET` | NextAuth v5 secret (equivalent to legacy `NEXTAUTH_SECRET`). |
| `NEXTAUTH_URL` | Canonical site URL, e.g. `https://walkoutofficial.com` (no trailing slash). |
| `SUPABASE_URL` | Project URL (Settings → API). |
| `SUPABASE_ANON_KEY` | Project anon public key. Required for `/api/restaurant/stream` (SSE). |

Optional / feature-specific: Stripe, Resend, Twilio, Upstash, etc.

## Database migrations

After env is set, migrations must be applied to the **same** database as `DATABASE_URL`:

```bash
npx prisma migrate deploy
```

Use `DIRECT_URL` in `.env` when running locally against Supabase. Vercel build can run `prisma migrate deploy` in the build step if configured.

## Smoke tests

1. Register or sign in as restaurant admin; open **Dashboard → Setup → Staff** and send an invite — confirm a row in `restaurant_staff` in Supabase Table Editor.
2. Add a menu category/item in **Dashboard → Menu** — confirm `menu_categories` / `menu_items` rows.
3. Open **Live tables** — confirm `/api/restaurant/stream` connects (browser Network → EventStream).

If step 1 fails with 503/500, check `DATABASE_URL` and that migrations have been applied.
