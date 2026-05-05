import { prisma } from '@/lib/prisma'

/**
 * Copies the active TableAssignment.staffId for the session's table
 * to TabSession.assignedStaffId. If no active assignment exists,
 * does nothing — a missing assignment triggers a UI warning, not an error.
 */
export async function assignServerToSession(
  sessionId: string,
  restaurantId: string
): Promise<void> {
  const session = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: { tableId: true },
  })

  if (!session) return

  const assignment = await prisma.tableAssignment.findFirst({
    where: {
      tableId: session.tableId,
      restaurantId,
      isActive: true,
    },
    select: { staffId: true },
    orderBy: { assignedAt: 'desc' },
  })

  if (!assignment) return

  await prisma.tabSession.update({
    where: { id: sessionId },
    data: { assignedStaffId: assignment.staffId },
  })
}
