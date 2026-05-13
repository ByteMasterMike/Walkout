import Link from 'next/link';
import { PageShell, PageHead, KpiStrip } from '@/components/pitch';

const DEMO_CHART = [
  { d: 'MON', h: 62, on: false },
  { d: 'TUE', h: 48, on: false },
  { d: 'WED', h: 71, on: false },
  { d: 'THU', h: 58, on: false },
  { d: 'FRI', h: 95, on: true },
  { d: 'SAT', h: 88, on: false },
  { d: 'SUN', h: 74, on: false },
];

export default function AnalyticsHubPage() {
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
              30 days
            </span>
            <span className="rounded-full border border-border px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              YTD
            </span>
          </div>
        }
      />

      <KpiStrip
        items={[
          { label: 'Revenue / wk', value: '—', detail: 'TODO: metrics API', detailClass: 'wn' },
          { label: 'Covers', value: '—', detail: 'TODO' },
          { label: 'Turn time', value: '—', detail: 'TODO' },
          { label: 'Walk-out rate', value: '—', detail: 'TODO' },
        ]}
      />

      <div className="mono mt-40" style={{ marginBottom: 14 }}>
        Revenue · sample week (mock)
      </div>
      <div className="chart">
        {DEMO_CHART.map((b) => (
          <div key={b.d} className={`bar ${b.on ? 'on' : ''}`} data-d={b.d}>
            <div className="h" style={{ height: `${b.h}%` }} />
          </div>
        ))}
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
