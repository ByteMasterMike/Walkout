import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requests = await prisma.serviceRequest.findMany({
    where: {
      restaurantId: session.user.restaurantId,
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
    include: {
      session: {
        select: {
          table: { select: { tableNumber: true } },
        },
      },
      participant: { select: { displayName: true } },
      acknowledgedBy: { select: { name: true } },
    },
  })

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      tableNumber: r.session.table.tableNumber,
      type: r.type,
      dinerName: r.participant.displayName,
      notes: r.notes,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      acknowledgedByName: r.acknowledgedBy?.name ?? null,
    })),
  })
}
