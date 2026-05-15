/** USD cents — platform default authorization hold ($1.00). */
export const DEFAULT_HOLD_AMOUNT_CENTS = 100

/** Allowed range for `Restaurant.defaultHoldAmount` (API-enforced). */
export const MIN_RESTAURANT_HOLD_CENTS = DEFAULT_HOLD_AMOUNT_CENTS
export const MAX_RESTAURANT_HOLD_CENTS = 15_000

/** Join/marketing copy — localized USD string for the default hold (e.g. "$1.00"). */
export function formatDefaultHoldUsd(): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    DEFAULT_HOLD_AMOUNT_CENTS / 100,
  )
}
