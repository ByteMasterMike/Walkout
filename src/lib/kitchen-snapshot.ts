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

/** Participant still has kitchen work if any visible line item is not yet SERVED. */
export function participantHasKitchenQueueOrders(orders: { status: string }[]): boolean {
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue
    if (o.status !== 'SERVED') return true
  }
  return false
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
      if (!participantHasKitchenQueueOrders(p.orders)) continue
      const visible = p.orders.filter((o) => o.status !== 'CANCELLED')

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
