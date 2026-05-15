import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { startOfDayInTz } from '@/lib/validate';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const restaurantId = session.user.restaurantId;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      tipDistributionMode: true,
      absorbTipProcessingFee: true,
      timezone: true,
    },
  });

  if (!restaurant) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const pools = await prisma.tipPool.findMany({
    where: { restaurantId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { entries: true } },
    },
  });

  const tz = restaurant.timezone;

  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get('days');
  let rollingDays = 7;
  if (daysParam !== null) {
    const n = Number.parseInt(daysParam, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 90) rollingDays = n;
  }

  const todayStart = startOfDayInTz(tz);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const rangeStart = new Date(todayStart.getTime() - (rollingDays - 1) * 24 * 60 * 60 * 1000);

  const tippedParticipants = await prisma.tabParticipant.findMany({
    where: {
      session: { restaurantId },
      captureStatus: 'CAPTURED',
      resolvedTipAmount: { gt: 0 },
    },
    select: {
      sessionId: true,
      resolvedTipAmount: true,
      feeAllocatedToTipCents: true,
      capturedAt: true,
      tipAssignedToStaffId: true,
      tipAssignedToStaff: { select: { name: true } },
    },
  });

  const filtered = tippedParticipants.filter((p) => {
    if (!p.capturedAt) return false;
    const t = p.capturedAt.getTime();
    return t >= rangeStart.getTime() && t < tomorrowStart.getTime();
  });

  type Agg = { staffName: string; grossCents: number; feeCents: number; sessions: Set<string> };
  const map = new Map<string | null, Agg>();

  for (const p of filtered) {
    const id = p.tipAssignedToStaffId;
    const staffName = p.tipAssignedToStaff?.name ?? 'Unattributed';
    let cur = map.get(id);
    if (!cur) {
      cur = { staffName, grossCents: 0, feeCents: 0, sessions: new Set<string>() };
      map.set(id, cur);
    }
    cur.grossCents += p.resolvedTipAmount ?? 0;
    cur.feeCents += p.feeAllocatedToTipCents ?? 0;
    cur.sessions.add(p.sessionId);
  }

  const directRows = [...map.entries()].map(([staffId, v]) => ({
    staffId,
    staffName: v.staffName,
    grossCents: v.grossCents,
    feeCents: v.feeCents,
    netCents: v.grossCents - v.feeCents,
    sessionCount: v.sessions.size,
  }));

  return NextResponse.json({
    tipDistributionMode: restaurant.tipDistributionMode,
    absorbTipProcessingFee: restaurant.absorbTipProcessingFee,
    timezone: restaurant.timezone,
    rollingDays,
    pools: pools.map((p) => ({
      id: p.id,
      status: p.status,
      shiftDate: p.shiftDate.toISOString(),
      totalAmountCents: p.totalAmountCents,
      entryCount: p._count.entries,
      createdAt: p.createdAt.toISOString(),
      closedAt: p.closedAt?.toISOString() ?? null,
      distributedAt: p.distributedAt?.toISOString() ?? null,
    })),
    directRows,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const restaurantId = session.user.restaurantId;

  const existing = await prisma.tipPool.findFirst({
    where: { restaurantId, status: 'OPEN' },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'An open tip pool already exists', poolId: existing.id },
      { status: 409 },
    );
  }

  try {
    const pool = await prisma.tipPool.create({
      data: {
        restaurantId,
        status: 'OPEN',
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        shiftDate: true,
      },
    });

    return NextResponse.json({ pool }, { status: 201 });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'P2002') {
      const pool = await prisma.tipPool.findFirst({
        where: { restaurantId, status: 'OPEN' },
      });
      return NextResponse.json(
        { error: 'Race creating pool — retry', poolId: pool?.id },
        { status: 409 },
      );
    }
    throw e;
  }
}
