# CSP allowed domains (Phase 6)

WalkOut `Content-Security-Policy` in `next.config.ts` allows third-party scripts and connections only where the product depends on them.

## Framework constraints

- **`script-src` `'unsafe-inline'` and `'unsafe-eval'`** — Common with Next.js + Stripe.js until the app can move to **strict CSP with nonces** (follow-up hardening). Documented here as accepted tradeoff for Phase 6.

## Allowed domains

| Directive | Domain | Used by |
|-----------|--------|---------|
| `script-src` | `'self'` | Next.js bundles |
| | `'unsafe-inline'` `'unsafe-eval'` | Next.js / dev tooling (tighten only if framework permits) |
| | `https://js.stripe.com` | Stripe.js |
| | `https://va.vercel-scripts.com` | `@vercel/analytics` loader |
| | `https://browser.sentry-cdn.com` | Sentry browser SDK loader |
| `style-src` | `'self'` `'unsafe-inline'` `https://fonts.googleapis.com` | App + Google Fonts CSS |
| `font-src` | `'self'` `https://fonts.gstatic.com` | Google Fonts files |
| `img-src` | `'self'` `data:` `blob:` `https://images.walkoutofficial.com` | UI + menu imagery |
| `connect-src` | `'self'` | Same-origin APIs |
| | `https://*.supabase.com` | Supabase client |
| | `https://generativelanguage.googleapis.com` | Gemini API |
| | `https://api.stripe.com` | Stripe API |
| | `https://errors.stripe.com` | Stripe errors |
| | `https://m.stripe.com` | Stripe beacon/metrics |
| | `https://m.stripe.network` | Stripe network |
| | `https://q.stripe.com` | Stripe telemetry |
| | `https://*.ingest.sentry.io` `https://*.ingest.us.sentry.io` `https://*.ingest.de.sentry.io` | Sentry ingest (multi-region) |
| | `https://vitals.vercel-insights.com` | Vercel Analytics / Speed Insights vitals |
| | `https://va.vercel-scripts.com` | Analytics script fetch |
| `frame-src` | `https://js.stripe.com` `https://hooks.stripe.com` | Stripe Elements / 3DS |

Do not widen these lists without verifying the dependency is actually loaded in production.
