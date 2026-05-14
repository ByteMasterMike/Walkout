import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfDayInTz } from '@/lib/validate'

const FloorAssignmentEntrySchema = z.object({
  tableId: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
})

const FloorLayoutSchema = z.object({
  assignments: z.array(FloorAssignmentEntrySchema),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use restaurant's configured timezone so "today" reflects local midnight,
  // not UTC midnight (which is 4–8h off for US timezones).
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { timezone: true },
  })
  const today = startOfDayInTz(restaurant?.timezone ?? 'America/New_York')

  const assignments = await prisma.tableAssignment.findMany({
    where: {
      restaurantId: session.user.restaurantId,
      isActive: true,
      assignedAt: { gte: today },
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
  })

  return NextResponse.json({ assignments })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = FloorLayoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  if (parsed.data.assignments.length === 0) {
    return NextResponse.json({ assignments: [] }, { status: 200 })
  }

  const { restaurantId } = session.user
  const tableIds = parsed.data.assignments.map((a) => a.tableId)
  const staffIdsNeedingCheck = parsed.data.assignments
    .map((a) => a.staffId)
    .filter((id): id is string => id !== null)
  const uniqueStaffIds = [...new Set(staffIdsNeedingCheck)]

  // Verify all tableIds and unique staffIds (when assigned) belong to this restaurant
  const [tableCount, staffCount] = await Promise.all([
    prisma.diningTable.count({
      where: { id: { in: tableIds }, restaurantId },
    }),
    uniqueStaffIds.length === 0
      ? Promise.resolve(0)
      : prisma.restaurantStaff.count({
          where: { id: { in: uniqueStaffIds }, restaurantId, isActive: true },
        }),
  ])

  if (tableCount !== tableIds.length) {
    return NextResponse.json({ error: 'One or more tables not found' }, { status: 422 })
  }
  if (uniqueStaffIds.length > 0 && staffCount !== uniqueStaffIds.length) {
    return NextResponse.json({ error: 'One or more staff members not found' }, { status: 422 })
  }

  // Deactivate old + create new in a single transaction so a crash/timeout
  // never leaves tables with no active assignment.
  const created = await prisma.$transaction(async (tx) => {
    await tx.tableAssignment.updateMany({
      where: { restaurantId, tableId: { in: tableIds }, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    })
    return Promise.all(
      parsed.data.assignments
        .filter((a) => a.staffId !== null)
        .map((a) =>
          tx.tableAssignment.create({
            data: {
              restaurantId,
              tableId: a.tableId,
              staffId: a.staffId as string,
            },
            select: { id: true, tableId: true, staffId: true, assignedAt: true },
          })
        )
    )
  })

  return NextResponse.json({ assignments: created }, { status: 201 })
}
