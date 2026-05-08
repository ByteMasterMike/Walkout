import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateUuid } from '@/lib/validate';

/**
 * POST /api/restaurant/tip-pool/[id]/distribute
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: poolId } = await params;
  const invalid = validateUuid(poolId, 'id');
  if (invalid) return invalid;

  const pool = await prisma.tipPool.findFirst({
    where: { id: poolId, restaurantId: session.user.restaurantId },
    select: { id: true, status: true },
  });

  if (!pool) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (pool.status !== 'CLOSED') {
    return NextResponse.json(
      { error: 'Pool must be closed before marking distributed' },
      { status: 422 },
    );
  }

  const now = new Date();
  await prisma.tipPool.update({
    where: { id: poolId },
    data: {
      status: 'DISTRIBUTED',
      distributedAt: now,
    },
  });

  return NextResponse.json({ ok: true, distributedAt: now.toISOString() });
}
