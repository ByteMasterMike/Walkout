/** USD cents — platform default authorization hold ($1.00). */
export const DEFAULT_HOLD_AMOUNT_CENTS = 100

/** Older rows still store this before $1 policy / migrations — map at Stripe PI time and lazily backfill DB. */
export const LEGACY_DEFAULT_HOLD_CENTS = 7500

/** Allowed range for `Restaurant.defaultHoldAmount` (API-enforced). */
export const MIN_RESTAURANT_HOLD_CENTS = DEFAULT_HOLD_AMOUNT_CENTS
export const MAX_RESTAURANT_HOLD_CENTS = 15_000

/** Normalize cents actually sent to Stripe for manual-capture holds (legacy DB cleanup). */
export function effectiveHoldAmountCents(storedCents: number): number {
  let cents =
    storedCents === LEGACY_DEFAULT_HOLD_CENTS ? DEFAULT_HOLD_AMOUNT_CENTS : storedCents
  cents = Math.min(Math.max(cents, MIN_RESTAURANT_HOLD_CENTS), MAX_RESTAURANT_HOLD_CENTS)
  return cents
}

/** Join/marketing copy — localized USD string for the default hold (e.g. "$1.00"). */
export function formatDefaultHoldUsd(): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    DEFAULT_HOLD_AMOUNT_CENTS / 100,
  )
}
