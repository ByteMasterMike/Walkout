'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageShell, PageHead, PageHeadMetaDot } from '@/components/pitch';

type Payload = {
  since: string;
  total: number;
  byType: Record<string, number>;
  byHour: number[];
  avgAcknowledgeSeconds: number;
};

export default function ServiceRequestAnalyticsPage() {
  const [data, setData] = useState<Payload | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/restaurant/analytics/service-requests');
    if (!res.ok) return;
    setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <PageShell>
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    );
  }

  const peakHour = data.byHour.indexOf(Math.max(...data.byHour));

  return (
    <PageShell>
      <Link href="/dashboard/analytics" className="mono mb-6 inline-block text-muted-foreground hover:text-foreground">
        ← Analytics
      </Link>
      <PageHead
        title={
          <>
            Service <em>requests</em>
          </>
        }
        subtitle={<>Last 30 days · since {new Date(data.since).toLocaleDateString()}</>}
        meta={
          <>
            <PageHeadMetaDot />
            Peak hour · {peakHour}:00
          </>
        }
      />

      <div className="kpi-strip">
        <div className="kpi">
          <div className="l">Total requests</div>
          <div className="v">{data.total}</div>
        </div>
        <div className="kpi">
          <div className="l">Avg. acknowledge</div>
          <div className="v">{data.avgAcknowledgeSeconds}s</div>
        </div>
      </div>

      <div className="mt-40">
        <h2 className="mono mb-2">By type</h2>
        <div className="rounded-[14px] border border-border bg-card divide-y divide-border">
          {Object.entries(data.byType).map(([type, n]) => (
            <div key={type} className="flex justify-between px-4 py-2 font-body text-sm text-foreground">
              <span>{type}</span>
              <span className="tabular-nums font-mono">{n}</span>
            </div>
          ))}
          {Object.keys(data.byType).length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No requests in this window.</p>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mono mb-2">Peak hour (starts)</h2>
        <p className="font-body text-sm text-muted-foreground">
          Hour {peakHour}:00 local server time — tune staffing around busiest request windows.
        </p>
      </div>
    </PageShell>
  );
}
