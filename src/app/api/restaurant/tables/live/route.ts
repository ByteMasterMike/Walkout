import Decimal from 'decimal.js';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type LiveTable = {
  id: string;
  tableNumber: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'CLOSING';
  assignedServerName: string | null;
  coverCount: number;
  runningTotalCents: number;
  openedAt: string | null;
  hasOpenServiceRequest: boolean;
  hasFailedHold: boolean;
  hasCashParticipant: boolean;
  holdStatus:
    | 'NONE'
    | 'PENDING'
    | 'HELD'
    | 'FAILED'
    | 'RELEASED'
    | 'EXPIRED'
    | 'REAUTHORIZING';
};

function pickHoldStatus(
  statuses: string[],
): LiveTable['holdStatus'] {
  if (statuses.includes('FAILED')) return 'FAILED';
  if (statuses.includes('REAUTHORIZING')) return 'REAUTHORIZING';
  if (statuses.includes('PENDING')) return 'PENDING';
  if (statuses.includes('HELD')) return 'HELD';
  if (statuses.includes('EXPIRED')) return 'EXPIRED';
  if (statuses.includes('RELEASED')) return 'RELEASED';
  return 'NONE';
}

/**
 * GET /api/restaurant/tables/live
 * Aggregated view for the live table grid (replaces mock data).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const restaurantId = session.user.restaurantId;

  const tables = await prisma.diningTable.findMany({
    where: { restaurantId, isActive: true },
    orderBy: { tableNumber: 'asc' },
    include: {
      sessions: {
        where: { status: { notIn: ['CLOSED', 'ABANDONED'] } },
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          participants: {
            select: {
              holdStatus: true,
              departedAt: true,
              isCashPayment: true,
              cashCollectedAt: true,
            },
          },
          serviceRequests: {
            where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
            take: 1,
            select: { id: true },
          },
          orders: {
            select: {
              status: true,
              unitPrice: true,
              taxAmount: true,
              quantity: true,
            },
          },
          assignedStaff: { select: { name: true } },
        },
      },
    },
  });

  const out: LiveTable[] = tables.map((t) => {
    const active = t.sessions[0];
    if (!active) {
      return {
        id: t.id,
        tableNumber: t.tableNumber,
        status: t.status as LiveTable['status'],
        assignedServerName: null,
        coverCount: 0,
        runningTotalCents: 0,
        openedAt: null,
        hasOpenServiceRequest: false,
        hasFailedHold: false,
        hasCashParticipant: false,
        holdStatus: 'NONE',
      };
    }

    const activeParticipants = active.participants.filter((p) => !p.departedAt);
    const coverCount = activeParticipants.length;

    let running = new Decimal(0);
    for (const o of active.orders) {
      if (o.status === 'CANCELLED') continue;
      const line = new Decimal(o.unitPrice.toString())
        .times(o.quantity)
        .plus(new Decimal(o.taxAmount.toString()));
      running = running.plus(line);
    }
    const runningTotalCents = running.mul(100).round().toNumber();

    const hasOpenServiceRequest = active.serviceRequests.length > 0;
    const hasFailedHold = active.participants.some((p) => p.holdStatus === 'FAILED');
    const hasCashParticipant = active.participants.some(
      (p) => p.isCashPayment && !p.cashCollectedAt,
    );
    const holdStatus = pickHoldStatus(active.participants.map((p) => p.holdStatus));

    return {
      id: t.id,
      tableNumber: t.tableNumber,
      status: t.status as LiveTable['status'],
      assignedServerName: active.assignedStaff?.name ?? null,
      coverCount,
      runningTotalCents,
      openedAt: active.createdAt.toISOString(),
      hasOpenServiceRequest,
      hasFailedHold,
      hasCashParticipant,
      holdStatus,
    };
  });

  return NextResponse.json({ tables: out });
}
