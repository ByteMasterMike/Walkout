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
4. After creation, reveal **Signing secret** (`whsec_...`) and add it to Vercel project env as `STRIPE_WEBHOOK_SECRET` (and locally in `.env.local`).

## Env file

`.env.local` is gitignored. Copy [.env.example](../.env.example) to `.env.local` and set `STRIPE_WEBHOOK_SECRET`.

## Tip links (`TIP_SECRET`)

Signed tip URLs (`/tip/[token]` and `POST /api/sessions/[sessionId]/tip`) require `TIP_SECRET` (see `.env.example`). Generate with `openssl rand -base64 32`.

## Apple Pay domain verification

Replace the placeholder file at `public/.well-known/apple-developer-merchantid-domain-association` with the file Stripe provides during **Apple Pay domain verification** before going live with production keys.
