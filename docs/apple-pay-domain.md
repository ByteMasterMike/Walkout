# Apple Pay domain verification (WalkOut)

The file served at:

`/.well-known/apple-developer-merchantid-domain-association`

must be the **exact** domain association file from Apple (no extension, no edits). The placeholder in the repo cannot verify Apple Pay.

## Steps

1. **Apple Developer** — [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers** → **Merchant IDs** → select your merchant ID → **View details** → download **Domain verification** / association file.
2. Replace `public/.well-known/apple-developer-merchantid-domain-association` in this repo with that file (binary-safe; keep no `.txt` extension).
3. **Stripe Dashboard** — **Settings** → **Payment methods** → **Apple Pay** → **Add new domain** → enter your production host (e.g. `walkoutofficial.com`).
4. Deploy, then confirm Stripe shows the domain as **verified** and that this URL returns the file as plain text (200, correct `Content-Type`):

   `https://<your-domain>/.well-known/apple-developer-merchantid-domain-association`

5. Repeat for preview/staging domains if you use Apple Pay there.

## Operations note

- Vercel serves `public/` as static assets; no extra routing is required.
- Do not put authentication in front of this path.
