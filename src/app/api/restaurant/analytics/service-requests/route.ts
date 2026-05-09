import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/restaurant/analytics/service-requests
 *
 * Operational aggregates for the dashboard (§21.6).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.restaurantId || (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rid = session.user.restaurantId;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const reqs = await prisma.serviceRequest.findMany({
    where: {
      restaurantId: rid,
      createdAt: { gte: since },
    },
    select: {
      type: true,
      createdAt: true,
      acknowledgedAt: true,
    },
  });

  const byType: Record<string, number> = {};
  const byHour = Array.from({ length: 24 }, () => 0);
  let ackSumMs = 0;
  let ackCount = 0;

  for (const r of reqs) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    byHour[r.createdAt.getHours()] += 1;
    if (r.acknowledgedAt) {
      ackSumMs += r.acknowledgedAt.getTime() - r.createdAt.getTime();
      ackCount += 1;
    }
  }

  const avgAckSec = ackCount > 0 ? Math.round(ackSumMs / ackCount / 1000) : 0;

  return NextResponse.json({
    since: since.toISOString(),
    total: reqs.length,
    byType,
    byHour,
    avgAcknowledgeSeconds: avgAckSec,
  });
}
