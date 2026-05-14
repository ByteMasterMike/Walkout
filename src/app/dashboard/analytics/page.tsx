import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { getRestaurantDashboardAggregates } from '@/lib/dashboard-aggregates';
import { PageShell, PageHead, KpiStrip } from '@/components/pitch';

export const dynamic = 'force-dynamic';

function fmtUsd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default async function AnalyticsHubPage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect('/auth/login');

  const agg = await getRestaurantDashboardAggregates(session.user.restaurantId);
  const weekRevenue = agg.revenueByDay.reduce((s, d) => s + d.cents, 0);

  return (
    <PageShell>
      <PageHead
        title={
          <>
            <em>Analytics</em>
          </>
        }
        subtitle={<>Last 7 days · covers, revenue, table turnover. Hub links to detailed reports.</>}
        actions={
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              7 days
            </span>
            <span className="rounded-full bg-invert px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-invert-foreground">
              Live data
            </span>
          </div>
        }
      />

      <KpiStrip
        items={[
          {
            label: 'Revenue / wk',
            value: fmtUsd(weekRevenue),
            detail: 'Sum of captured checks (7d)',
            detailClass: 'wn',
          },
          {
            label: 'Tables tonight',
            value: `${agg.tablesActive} / ${agg.tablesTotal}`,
            detail: 'Open sessions vs tables',
          },
          {
            label: 'Avg ticket tonight',
            value: agg.avgTicketCents != null ? fmtUsd(agg.avgTicketCents) : '—',
            detail: 'Captured checks only',
          },
          {
            label: 'Open holds',
            value: String(agg.openHolds),
            detail: 'Active authorization holds',
          },
        ]}
      />

      <div className="mono mt-40" style={{ marginBottom: 14 }}>
        Revenue · last 7 days (captured)
      </div>
      <div className="chart">
        {agg.revenueByDay.map((b) => {
          const h = agg.revenueWeekMaxCents > 0 ? Math.round((b.cents / agg.revenueWeekMaxCents) * 100) : 0;
          const today =
            b.date ===
            agg.revenueByDay[agg.revenueByDay.length - 1]?.date;
          return (
            <div key={b.date} className={`bar ${today ? 'on' : ''}`} data-d={b.label}>
              <div className="h" style={{ height: `${Math.max(h, 4)}%` }} />
            </div>
          );
        })}
      </div>

      <div className="mt-40 flex flex-col gap-3">
        <Link
          href="/dashboard/analytics/tips"
          className="card tap block no-underline hover:no-underline"
        >
          <h3>
            Tips <em>analytics</em>
          </h3>
          <p>Direct mode totals · tip pools · CSV export.</p>
        </Link>
        <a
          href={`/api/restaurant/analytics/tax/quarterly?year=${new Date().getFullYear()}&quarter=${Math.ceil((new Date().getMonth() + 1) / 3)}`}
          className="card tap block no-underline hover:no-underline"
        >
          <h3>
            Quarterly <em>tax CSV</em>
          </h3>
          <p>Download snapshotted tax amounts by day.</p>
        </a>
        <Link
          href="/dashboard/analytics/requests"
          className="card tap block no-underline hover:no-underline"
        >
          <h3>
            Service <em>requests</em>
          </h3>
          <p>Volume and response times.</p>
        </Link>
      </div>
    </PageShell>
  );
}
