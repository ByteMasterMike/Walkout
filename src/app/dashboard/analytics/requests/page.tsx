'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

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
    return <div className="px-4 py-16 text-center text-sm text-neutral-400">Loading…</div>;
  }

  const peakHour = data.byHour.indexOf(Math.max(...data.byHour));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <Link href="/dashboard/analytics" className="text-xs text-neutral-400 hover:text-neutral-600">
        Analytics
      </Link>
      <h1 className="text-xl font-bold text-neutral-900">Service requests</h1>
      <p className="text-sm text-neutral-500">Last 30 days · since {new Date(data.since).toLocaleDateString()}</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500 uppercase">Total requests</p>
          <p className="text-2xl font-semibold tabular-nums">{data.total}</p>
        </div>
        <div className="border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500 uppercase">Avg. time to acknowledge</p>
          <p className="text-2xl font-semibold tabular-nums">{data.avgAcknowledgeSeconds}s</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-neutral-800 mb-2">By type</h2>
        <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100">
          {Object.entries(data.byType).map(([type, n]) => (
            <div key={type} className="flex justify-between px-4 py-2 text-sm">
              <span>{type}</span>
              <span className="tabular-nums">{n}</span>
            </div>
          ))}
          {Object.keys(data.byType).length === 0 && (
            <p className="px-4 py-6 text-sm text-neutral-400 text-center">No requests in this window.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-neutral-800 mb-2">Peak hour (starts)</h2>
        <p className="text-sm text-neutral-600">
          Hour {peakHour}:00 local server time — tune staffing around busiest request windows.
        </p>
      </div>
    </div>
  );
}
