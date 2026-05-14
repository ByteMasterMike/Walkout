import { prisma } from '@/lib/prisma'
import { startOfDayInTz } from '@/lib/validate'

export type DashboardAggregates = {
  tablesActive: number
  tablesTotal: number
  revenueTonightCents: number
  avgTicketCents: number | null
  openHolds: number
  revenueByDay: { date: string; cents: number; label: string }[]
  revenueWeekMaxCents: number
}

/** YYYY-MM-DD for a Date interpreted in `tz`. */
function ymdInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const day = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${day}`
}

export async function getRestaurantDashboardAggregates(restaurantId: string): Promise<DashboardAggregates> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true },
  })
  const tz = restaurant?.timezone ?? 'America/New_York'

  const todayMidnight = startOfDayInTz(tz)
  const dayMetas: { ymd: string; start: Date; end: Date; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date(todayMidnight.getTime() - i * 24 * 60 * 60 * 1000)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const ymd = ymdInTz(start, tz)
    const label = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz })
      .format(start)
      .slice(0, 3)
      .toUpperCase()
    dayMetas.push({ ymd, start, end, label })
  }

  const tonightStart = dayMetas[6].start
  const tonightEnd = dayMetas[6].end
  const weekStart = dayMetas[0].start
  const weekEnd = dayMetas[6].end

  const [tablesTotal, tablesActive, openHoldsAgg, capturedTonight, capturedWeek] = await Promise.all([
    prisma.diningTable.count({ where: { restaurantId, isActive: true } }),
    prisma.tabSession.count({
      where: {
        restaurantId,
        status: { in: ['OPEN', 'AWAITING_TIP', 'CAPTURING', 'CLOSING'] },
      },
    }),
    prisma.tabParticipant.count({
      where: {
        holdStatus: { in: ['PENDING', 'HELD'] },
        session: { restaurantId, status: { in: ['OPEN', 'AWAITING_TIP', 'CAPTURING', 'CLOSING'] } },
      },
    }),
    prisma.tabParticipant.findMany({
      where: {
        session: { restaurantId },
        capturedAt: { gte: tonightStart, lt: tonightEnd },
        capturedAmount: { gt: 0 },
      },
      select: { capturedAmount: true },
    }),
    prisma.tabParticipant.findMany({
      where: {
        session: { restaurantId },
        capturedAt: { gte: weekStart, lt: weekEnd },
        capturedAmount: { gt: 0 },
      },
      select: { capturedAt: true, capturedAmount: true },
    }),
  ])

  const revenueTonightCents = capturedTonight.reduce((s, r) => s + (r.capturedAmount ?? 0), 0)
  const countTickets = capturedTonight.length
  const avgTicketCents =
    countTickets > 0 ? Math.round(revenueTonightCents / countTickets) : null

  const bucket = new Map<string, number>()
  for (const m of dayMetas) {
    bucket.set(m.ymd, 0)
  }
  for (const row of capturedWeek) {
    if (!row.capturedAt) continue
    const key = ymdInTz(row.capturedAt, tz)
    if (!bucket.has(key)) continue
    bucket.set(key, (bucket.get(key) ?? 0) + (row.capturedAmount ?? 0))
  }

  const revenueByDay = dayMetas.map((m) => ({
    date: m.ymd,
    cents: bucket.get(m.ymd) ?? 0,
    label: m.label,
  }))
  const revenueWeekMaxCents = Math.max(1, ...revenueByDay.map((d) => d.cents))

  return {
    tablesActive,
    tablesTotal,
    revenueTonightCents,
    avgTicketCents,
    openHolds: openHoldsAgg,
    revenueByDay,
    revenueWeekMaxCents,
  }
}
