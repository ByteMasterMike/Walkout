import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const FloorAssignmentEntrySchema = z.object({
  tableId: z.string().uuid(),
  staffId: z.string().uuid(),
})

const FloorLayoutSchema = z.object({
  assignments: z.array(FloorAssignmentEntrySchema).min(1),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

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

  const { restaurantId } = session.user
  const tableIds = parsed.data.assignments.map((a) => a.tableId)
  // Deduplicate staffIds — one server can cover multiple tables, so the same
  // staffId appearing N times is valid and must not fail the count check.
  const uniqueStaffIds = [...new Set(parsed.data.assignments.map((a) => a.staffId))]

  // Verify all tableIds and unique staffIds belong to this restaurant
  const [tableCount, staffCount] = await Promise.all([
    prisma.diningTable.count({
      where: { id: { in: tableIds }, restaurantId },
    }),
    prisma.restaurantStaff.count({
      where: { id: { in: uniqueStaffIds }, restaurantId, isActive: true },
    }),
  ])

  if (tableCount !== tableIds.length) {
    return NextResponse.json({ error: 'One or more tables not found' }, { status: 422 })
  }
  if (staffCount !== uniqueStaffIds.length) {
    return NextResponse.json({ error: 'One or more staff members not found' }, { status: 422 })
  }

  // Deactivate existing active assignments for the affected tables
  await prisma.tableAssignment.updateMany({
    where: {
      restaurantId,
      tableId: { in: tableIds },
      isActive: true,
    },
    data: { isActive: false, endedAt: new Date() },
  })

  // Create new assignments
  const created = await prisma.$transaction(
    parsed.data.assignments.map((a) =>
      prisma.tableAssignment.create({
        data: {
          restaurantId,
          tableId: a.tableId,
          staffId: a.staffId,
        },
        select: {
          id: true,
          tableId: true,
          staffId: true,
          assignedAt: true,
        },
      })
    )
  )

  return NextResponse.json({ assignments: created }, { status: 201 })
}
