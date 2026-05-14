import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { refreshConnectStatus } from '@/lib/stripe/refreshConnectStatus'

/**
 * POST /api/restaurant/stripe/connect/refresh — ADMIN only
 *
 * Re-reads the connected Stripe account and updates
 * `Restaurant.stripeConnectOnboarded` accordingly. Used by:
 *  - the "Re-check status" button in the dashboard setup page
 *  - any client that needs to confirm onboarding state without waiting for
 *    the `account.updated` webhook
 */
export async function POST() {
  const session = await auth()
  if (!session?.user?.restaurantId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const status = await refreshConnectStatus({
    restaurantId: session.user.restaurantId,
  })

  return NextResponse.json(status)
}
