import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfDayInTz } from '@/lib/validate'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { timezone: true },
  })
  const today = startOfDayInTz(restaurant?.timezone ?? 'America/New_York')

  // Find the most recent prior-day assignments (before today)
  const assignments = await prisma.tableAssignment.findMany({
    where: {
      restaurantId: session.user.restaurantId,
      assignedAt: { lt: today },
    },
    select: {
      id: true,
      tableId: true,
      staffId: true,
      assignedAt: true,
      table: { select: { tableNumber: true } },
      staff: { select: { name: true, email: true } },
    },
    orderBy: { assignedAt: 'desc' },
    // Grab enough to cover a full prior-day floor setup (up to 50 tables)
    take: 50,
  })

  // Deduplicate: keep the most recent assignment per table
  const seen = new Set<string>()
  const deduped = assignments.filter((a) => {
    if (seen.has(a.tableId)) return false
    seen.add(a.tableId)
    return true
  })

  return NextResponse.json({ assignments: deduped })
}
