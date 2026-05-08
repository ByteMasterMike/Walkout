import { Decimal } from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { endOfZonedDayExclusive, startOfZonedDayForRef } from '@/lib/validate';

export type TodayAnalytics = {
  revenueCents: number;
  covers: number;
  tipsCents: number;
  taxQtdCents: number;
  /** Seven entries: oldest local day → today (restaurant timezone). */
  last7DaysCents: number[];
};

/** UTC calendar quarter bounds (matches `/api/restaurant/analytics/tax/quarterly`). */
export function quarterBoundsUtc(year: number, quarter: number): { start: Date; end: Date } {
  const m0 = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, m0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, m0 + 3, 0, 23, 59, 59, 999));
  return { start, end };
}

/**
 * Owner overview KPIs — sums from snapshotted TabParticipant + OrderItem.taxAmount only (§21.7).
 */
export async function computeRestaurantAnalyticsToday(
  restaurantId: string,
  timezone: string | null | undefined,
): Promise<TodayAnalytics> {
  const tz = timezone?.trim() || 'America/New_York';
  const now = new Date();

  const todayStart = startOfZonedDayForRef(tz, now);
  const todayEnd = endOfZonedDayExclusive(tz, now);

  const closedToday = await prisma.tabSession.findMany({
    where: {
      restaurantId,
      status: 'CLOSED',
      closedAt: { gte: todayStart, lt: todayEnd },
    },
    select: {
      participants: {
        select: {
          subtotalCents: true,
          resolvedTipAmount: true,
        },
      },
    },
  });

  let revenueCents = 0;
  let tipsCents = 0;
  let covers = 0;
  for (const s of closedToday) {
    for (const p of s.participants) {
      covers += 1;
      revenueCents += p.subtotalCents ?? 0;
      tipsCents += p.resolvedTipAmount ?? 0;
    }
  }

  const utcMonth = now.getUTCMonth() + 1;
  const utcYear = now.getUTCFullYear();
  const quarter = Math.ceil(utcMonth / 3);
  const { start: qStart, end: qEnd } = quarterBoundsUtc(utcYear, quarter);

  const sessionsQtd = await prisma.tabSession.findMany({
    where: {
      restaurantId,
      status: 'CLOSED',
      closedAt: { gte: qStart, lte: qEnd },
    },
    select: {
      orders: {
        select: { taxAmount: true, status: true },
      },
    },
  });

  let taxQtdCents = 0;
  for (const s of sessionsQtd) {
    for (const o of s.orders) {
      if (o.status === 'CANCELLED') continue;
      const tax = new Decimal(o.taxAmount.toString()).times(100).toDecimalPlaces(0).toNumber();
      taxQtdCents += tax;
    }
  }

  const last7DaysCents: number[] = [];
  for (let daysBack = 6; daysBack >= 0; daysBack--) {
    const ref = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const dayStart = startOfZonedDayForRef(tz, ref);
    const dayEnd = endOfZonedDayExclusive(tz, ref);

    const rows = await prisma.tabParticipant.findMany({
      where: {
        session: {
          restaurantId,
          status: 'CLOSED',
          closedAt: { gte: dayStart, lt: dayEnd },
        },
      },
      select: { subtotalCents: true },
    });

    let dayRev = 0;
    for (const r of rows) {
      dayRev += r.subtotalCents ?? 0;
    }
    last7DaysCents.push(dayRev);
  }

  return {
    revenueCents,
    covers,
    tipsCents,
    taxQtdCents,
    last7DaysCents,
  };
}
