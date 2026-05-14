import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getKitchenSnapshot } from '@/lib/kitchen-snapshot'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const snap = await getKitchenSnapshot(session.user.restaurantId)
  return NextResponse.json(snap)
}
