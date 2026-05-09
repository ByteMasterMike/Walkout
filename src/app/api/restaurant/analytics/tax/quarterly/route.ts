import { NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function quarterBoundsUtc(year: number, quarter: number): { start: Date; end: Date } {
  const m0 = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, m0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, m0 + 3, 0, 23, 59, 59, 999));
  return { start, end };
}

/**
 * GET /api/restaurant/analytics/tax/quarterly?year=2026&quarter=2
 *
 * CSV from snapshotted OrderItem.taxAmount only (§12.5).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.restaurantId || (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rid = session.user.restaurantId;
  const url = new URL(request.url);
  const year = Number(url.searchParams.get('year') ?? new Date().getUTCFullYear());
  const quarter = Number(url.searchParams.get('quarter') ?? Math.ceil((new Date().getUTCMonth() + 1) / 3));

  if (!Number.isFinite(year) || quarter < 1 || quarter > 4) {
    return NextResponse.json({ error: 'Invalid year or quarter' }, { status: 422 });
  }

  const { start, end } = quarterBoundsUtc(year, quarter);

  const sessions = await prisma.tabSession.findMany({
    where: {
      restaurantId: rid,
      closedAt: { gte: start, lte: end },
      status: 'CLOSED',
    },
    select: {
      id: true,
      closedAt: true,
      orders: {
        select: {
          status: true,
          unitPrice: true,
          quantity: true,
          taxAmount: true,
          taxRate: true,
        },
      },
    },
  });

  type DayAgg = { sessions: Set<string>; foodCents: number; taxCents: number };
  const byDay = new Map<string, DayAgg>();

  for (const s of sessions) {
    if (!s.closedAt) continue;
    const day = s.closedAt.toISOString().slice(0, 10);
    let agg = byDay.get(day);
    if (!agg) {
      agg = { sessions: new Set(), foodCents: 0, taxCents: 0 };
      byDay.set(day, agg);
    }
    agg.sessions.add(s.id);

    for (const o of s.orders) {
      if (o.status === 'CANCELLED') continue;
      const unit = new Decimal(o.unitPrice.toString());
      const lineFood = unit.times(o.quantity).times(100).toDecimalPlaces(0).toNumber();
      const tax = new Decimal(o.taxAmount.toString()).times(100).toDecimalPlaces(0).toNumber();
      agg.foodCents += lineFood;
      agg.taxCents += tax;
    }
  }

  const rows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const lines = ['date,sessions,food_subtotal_usd,tax_collected_usd,effective_tax_rate'];
  for (const [date, agg] of rows) {
    const foodUsd = (agg.foodCents / 100).toFixed(2);
    const taxUsd = (agg.taxCents / 100).toFixed(2);
    const rate = agg.foodCents > 0 ? (agg.taxCents / agg.foodCents).toFixed(4) : '0.0000';
    lines.push(`${date},${agg.sessions.size},${foodUsd},${taxUsd},${rate}`);
  }

  const csv = lines.join('\n');
  const fname = `tax-report-${year}-Q${quarter}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
