import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDinerIdFromSession } from '@/lib/diner-session';

export async function GET() {
  const session = await auth();
  const dinerId = getDinerIdFromSession(session);
  if (!dinerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await prisma.tabParticipant.findMany({
    where: {
      dinerId,
      captureStatus: 'CAPTURED',
    },
    orderBy: { joinedAt: 'desc' },
    take: 40,
    include: {
      session: {
        include: {
          restaurant: { select: { name: true } },
          table: { select: { tableNumber: true } },
        },
      },
      orders: {
        include: {
          menuItem: { select: { name: true } },
        },
      },
    },
  });

  const payload = rows.map((p) => ({
    id: p.id,
    joinedAt: p.joinedAt.toISOString(),
    capturedAt: p.capturedAt?.toISOString() ?? null,
    capturedAmountCents: p.capturedAmount,
    resolvedTipAmountCents: p.resolvedTipAmount,
    subtotalCents: p.subtotalCents,
    taxCents: p.taxCents,
    serviceFeeCents: p.serviceFeeCents,
    restaurantName: p.session.restaurant.name,
    tableNumber: p.session.table.tableNumber,
    orders: p.orders.map((o) => ({
      name: o.menuItem.name,
      quantity: o.quantity,
      unitPrice: o.unitPrice.toString(),
      taxAmount: o.taxAmount.toString(),
      status: o.status,
    })),
  }));

  return NextResponse.json({ sessions: payload });
}
