# Stripe webhook endpoint setup

## Local / staging

1. Run the app with a public URL (e.g. [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe listen --forward-to localhost:3000/api/webhooks/stripe`).
2. The CLI prints a **webhook signing secret** starting with `whsec_`. Put it in `.env.local` as `STRIPE_WEBHOOK_SECRET=...`

## Production (Vercel)

1. Open [Stripe Dashboard → Webhooks (test mode)](https://dashboard.stripe.com/test/webhooks) or live mode for production.
2. **Add endpoint** → URL: `https://<your-domain>/api/webhooks/stripe`
3. Select events (minimum):
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `account.updated` — required so `Restaurant.stripeConnectOnboarded` flips to `true` automatically when a connected Express account finishes onboarding (and back to `false` if Stripe later restricts charges).
4. In the same webhook config, also check **Listen to events on Connected accounts** so `account.updated` events for connected Express accounts (not just the platform account) reach this endpoint.
5. After creation, reveal **Signing secret** (`whsec_...`) and add it to Vercel project env as `STRIPE_WEBHOOK_SECRET` (and locally in `.env.local`).

> Without `account.updated`, the dashboard will keep showing "Onboarding incomplete" even after Stripe verifies the restaurant. The dashboard setup page does an extra on-demand refresh as a fallback (and exposes a *Re-check status* button), but the webhook is the durable path.

## Env file

`.env.local` is gitignored. Copy [.env.example](../.env.example) to `.env.local` and set `STRIPE_WEBHOOK_SECRET`.

## Tip links (`TIP_SECRET`)

Signed tip URLs (`/tip/[token]` and `POST /api/sessions/[sessionId]/tip`) require `TIP_SECRET` (see `.env.example`). Generate with `openssl rand -base64 32`.

## Apple Pay domain verification

Replace the placeholder file at `public/.well-known/apple-developer-merchantid-domain-association` with the file Stripe provides during **Apple Pay domain verification** before going live with production keys.
