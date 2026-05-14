import { prisma } from '@/lib/prisma'

export type KitchenApiTile = {
  tableNumber: string
  participantName: string
  dietaryNotes: string | null
  openedAt: string
  items: {
    id: string
    name: string
    quantity: number
    notes: string | null
    status: string
    allergens: string[]
    updatedAt: string
  }[]
}

export async function getKitchenSnapshot(restaurantId: string): Promise<{ tiles: KitchenApiTile[] }> {
  const openStatuses = ['OPEN', 'AWAITING_TIP', 'CAPTURING', 'CLOSING'] as const

  const sessions = await prisma.tabSession.findMany({
    where: { restaurantId, status: { in: [...openStatuses] } },
    include: {
      table: { select: { tableNumber: true } },
      participants: {
        include: {
          orders: {
            include: {
              menuItem: { select: { name: true, allergens: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const tiles: KitchenApiTile[] = []

  for (const sess of sessions) {
    for (const p of sess.participants) {
      const visible = p.orders.filter((o) => o.status !== 'CANCELLED')
      if (visible.length === 0) continue

      tiles.push({
        tableNumber: sess.table.tableNumber,
        participantName: p.displayName,
        dietaryNotes: p.dietaryNotes,
        openedAt: p.joinedAt.toISOString(),
        items: visible.map((o) => ({
          id: o.id,
          name: o.menuItem.name,
          quantity: o.quantity,
          notes: o.notes,
          status: o.status,
          allergens: o.menuItem.allergens,
          updatedAt: o.updatedAt.toISOString(),
        })),
      })
    }
  }

  return { tiles }
}
