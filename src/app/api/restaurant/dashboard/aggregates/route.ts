import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getRestaurantDashboardAggregates } from '@/lib/dashboard-aggregates'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const aggregates = await getRestaurantDashboardAggregates(session.user.restaurantId)
  return NextResponse.json(aggregates)
}
