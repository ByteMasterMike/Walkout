import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeRestaurantAnalyticsToday } from '@/lib/analytics/today';

/**
 * GET /api/restaurant/analytics/today
 * KPI snapshot for owner overview (§21.7).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.restaurantId || (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rid = session.user.restaurantId;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: rid },
    select: { timezone: true },
  });

  const data = await computeRestaurantAnalyticsToday(rid, restaurant?.timezone);

  return NextResponse.json(data);
}
