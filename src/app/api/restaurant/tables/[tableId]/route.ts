import Decimal from 'decimal.js';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateUuid } from '@/lib/validate';

/**
 * GET /api/restaurant/tables/[tableId]
 * Live session detail for floor dashboard.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tableId: string }> },
) {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tableId } = await params;
  const invalid = validateUuid(tableId, 'tableId');
  if (invalid) return invalid;

  const table = await prisma.diningTable.findFirst({
    where: { id: tableId, restaurantId: session.user.restaurantId },
    select: {
      id: true,
      tableNumber: true,
      status: true,
      sessions: {
        where: { status: { notIn: ['CLOSED', 'ABANDONED'] } },
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          participants: {
            orderBy: { joinedAt: 'asc' },
            include: {
              orders: {
                include: {
                  menuItem: { select: { name: true, allergens: true } },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
          serviceRequests: {
            where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
              participant: { select: { displayName: true } },
              acknowledgedBy: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!table) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const activeSession = table.sessions[0] ?? null;

  if (!activeSession) {
    return NextResponse.json({
      tableId: table.id,
      tableNumber: table.tableNumber,
      sessionId: null,
      participants: [],
      serviceRequests: [],
    });
  }

  const participants = activeSession.participants.map((p) => {
    let subtotalCents = 0;
    const orders = p.orders.map((o) => {
      if (o.status !== 'CANCELLED') {
        const line = new Decimal(o.unitPrice.toString())
          .times(o.quantity)
          .mul(100)
          .round()
          .toNumber();
        subtotalCents += line;
      }
      return {
        id: o.id,
        menuItemName: o.menuItem.name,
        quantity: o.quantity,
        unitPrice: o.unitPrice.toString(),
        taxAmount: o.taxAmount.toString(),
        notes: o.notes,
        status: o.status,
        allergens: o.menuItem.allergens,
      };
    });

    return {
      id: p.id,
      displayName: p.displayName,
      isHost: p.isHost,
      holdStatus: p.holdStatus,
      captureStatus: p.captureStatus,
      isCashPayment: p.isCashPayment,
      cashCollectedAt: p.cashCollectedAt?.toISOString() ?? null,
      subtotalCents,
      orders,
    };
  });

  const serviceRequests = activeSession.serviceRequests.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    dinerName: r.participant.displayName,
    createdAt: r.createdAt.toISOString(),
    acknowledgedByName: r.acknowledgedBy?.name ?? null,
  }));

  return NextResponse.json({
    tableId: table.id,
    tableNumber: table.tableNumber,
    sessionId: activeSession.id,
    participants,
    serviceRequests,
  });
}
