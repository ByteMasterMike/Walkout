import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateUuid } from '@/lib/validate'

/**
 * POST /api/restaurant/sessions/[id]/clear
 *
 * Staff "Table Cleared" — seating state ONLY (PRD §11.6).
 * Does NOT fire capture or change TabParticipant.captureStatus.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  const invalidId = validateUuid(sessionId, 'sessionId')
  if (invalidId) return invalidId

  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tab = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      restaurantId: true,
      tableId: true,
    },
  })

  if (!tab) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (tab.restaurantId !== session.user.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const clearedByStaffId = session.user.staffId ?? null

  await prisma.$transaction([
    prisma.tabSession.update({
      where: { id: sessionId },
      data: {
        seatingClearedAt: now,
        clearedByStaff: true,
        clearedAt: now,
        clearedByStaffId,
      },
    }),
    prisma.diningTable.update({
      where: { id: tab.tableId },
      data: { status: 'AVAILABLE' },
    }),
  ])

  return NextResponse.json({ ok: true, seatingClearedAt: now.toISOString() })
}
