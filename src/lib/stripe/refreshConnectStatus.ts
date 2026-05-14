import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export type ConnectStatus = {
  /** True only when Stripe can charge against the connected account. */
  onboarded: boolean
  hasAccount: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  /** Requirements Stripe still needs from the restaurant, if any. */
  requirementsCurrentlyDue: string[]
  /** Stripe-supplied reason charges are disabled (e.g. `requirements.past_due`). */
  disabledReason: string | null
}

const EMPTY_STATUS: ConnectStatus = {
  onboarded: false,
  hasAccount: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  requirementsCurrentlyDue: [],
  disabledReason: null,
}

/**
 * Retrieve the connected Stripe account, compute the WalkOut "onboarded" flag,
 * and persist any change to `Restaurant.stripeConnectOnboarded`.
 *
 * Used both on the dashboard return path (`?success=1`) and from the
 * `account.updated` webhook so the flag stays in sync without manual action.
 *
 * Definition of "onboarded": `details_submitted && charges_enabled`. We do not
 * require `payouts_enabled` — restaurants can collect charges before payouts
 * are fully enabled (Stripe routinely takes longer on payout verification).
 */
export async function refreshConnectStatus(args: {
  restaurantId: string
}): Promise<ConnectStatus> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: args.restaurantId },
    select: { stripeConnectAccountId: true, stripeConnectOnboarded: true },
  })

  if (!restaurant?.stripeConnectAccountId) {
    return EMPTY_STATUS
  }

  let account
  try {
    account = await stripe.accounts.retrieve(restaurant.stripeConnectAccountId)
  } catch (err) {
    console.error('[refreshConnectStatus] stripe.accounts.retrieve failed:', err)
    return { ...EMPTY_STATUS, hasAccount: true }
  }

  const chargesEnabled = Boolean(account.charges_enabled)
  const payoutsEnabled = Boolean(account.payouts_enabled)
  const detailsSubmitted = Boolean(account.details_submitted)
  const onboarded = chargesEnabled && detailsSubmitted

  if (onboarded !== restaurant.stripeConnectOnboarded) {
    await prisma.restaurant.update({
      where: { id: args.restaurantId },
      data: { stripeConnectOnboarded: onboarded },
    })
  }

  return {
    onboarded,
    hasAccount: true,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  }
}

/**
 * Variant that accepts a Stripe.Account from a webhook payload, avoiding the
 * extra API round-trip. Resolves the restaurant by `stripeConnectAccountId`.
 *
 * Returns `null` if no restaurant maps to that account.
 */
export async function applyConnectAccountUpdate(account: {
  id: string
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
  requirements?: { currently_due?: string[] | null; disabled_reason?: string | null } | null
}): Promise<ConnectStatus | null> {
  const restaurant = await prisma.restaurant.findFirst({
    where: { stripeConnectAccountId: account.id },
    select: { id: true, stripeConnectOnboarded: true },
  })

  if (!restaurant) return null

  const chargesEnabled = Boolean(account.charges_enabled)
  const payoutsEnabled = Boolean(account.payouts_enabled)
  const detailsSubmitted = Boolean(account.details_submitted)
  const onboarded = chargesEnabled && detailsSubmitted

  if (onboarded !== restaurant.stripeConnectOnboarded) {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { stripeConnectOnboarded: onboarded },
    })
  }

  return {
    onboarded,
    hasAccount: true,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  }
}
