import Decimal from 'decimal.js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateUuid } from '@/lib/validate';

const PatchTableSchema = z.object({
  isActive: z.boolean(),
});

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
        where: {
          status: { notIn: ['CLOSED', 'ABANDONED'] },
          seatingClearedAt: null,
        },
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

/**
 * PATCH /api/restaurant/tables/[tableId]
 * Hide or restore a table on the floor (`isActive`). Join NFC rejects inactive tables.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tableId: string }> },
) {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tableId } = await params;
  const invalid = validateUuid(tableId, 'tableId');
  if (invalid) return invalid;

  const existing = await prisma.diningTable.findFirst({
    where: { id: tableId, restaurantId: session.user.restaurantId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PatchTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const updated = await prisma.diningTable.update({
    where: { id: tableId },
    data: { isActive: parsed.data.isActive },
    select: {
      id: true,
      tableNumber: true,
      nfcTagId: true,
      status: true,
      createdAt: true,
      isActive: true,
    },
  });

  return NextResponse.json({ table: updated });
}

/**
 * DELETE /api/restaurant/tables/[tableId]
 * Remove a table only when it has never hosted a tab session (owner setup correction).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tableId: string }> },
) {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tableId } = await params;
  const invalid = validateUuid(tableId, 'tableId');
  if (invalid) return invalid;

  const table = await prisma.diningTable.findFirst({
    where: { id: tableId, restaurantId: session.user.restaurantId },
    select: { id: true },
  });
  if (!table) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sessionCount = await prisma.tabSession.count({ where: { tableId } });
  if (sessionCount > 0) {
    return NextResponse.json(
      {
        error:
          'This table has tab session history and cannot be deleted. Only tables that have never hosted a tab can be removed.',
        code: 'HAS_TAB_HISTORY',
      },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.tableAssignment.deleteMany({ where: { tableId } }),
    prisma.diningTable.delete({ where: { id: tableId } }),
  ]);

  return NextResponse.json({ success: true });
}
