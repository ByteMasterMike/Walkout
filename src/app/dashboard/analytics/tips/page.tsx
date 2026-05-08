'use client';

import { useCallback, useEffect, useState } from 'react';

type PoolRow = {
  id: string;
  status: string;
  shiftDate: string;
  totalAmountCents: number;
  entryCount: number;
  createdAt: string;
  closedAt: string | null;
  distributedAt: string | null;
};

type DirectRow = {
  staffId: string | null;
  staffName: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  sessionCount: number;
};

type TipPayload = {
  tipDistributionMode: 'DIRECT' | 'POOL';
  absorbTipProcessingFee: boolean;
  timezone: string;
  pools: PoolRow[];
  directRows: DirectRow[];
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TipsAnalyticsPage() {
  const [data, setData] = useState<TipPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    const res = await fetch('/api/restaurant/tip-pool');
    if (!res.ok) {
      setError('Could not load tip data');
      setLoading(false);
      return;
    }
    const json = (await res.json()) as TipPayload;
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openPool() {
    setActing('open');
    setError('');
    try {
      const res = await fetch('/api/restaurant/tip-pool', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          await load();
          return;
        }
        const msg =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Could not open pool';
        setError(msg);
        return;
      }
      await load();
    } finally {
      setActing(null);
    }
  }

  async function closePool(id: string) {
    setActing(`close-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/restaurant/tip-pool/${id}/close`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Could not close pool';
        setError(msg);
        return;
      }
      await load();
    } finally {
      setActing(null);
    }
  }

  async function distributePool(id: string) {
    setActing(`dist-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/restaurant/tip-pool/${id}/distribute`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Could not mark distributed';
        setError(msg);
        return;
      }
      await load();
    } finally {
      setActing(null);
    }
  }

  function downloadDirectCsv() {
    if (!data) return;
    const absorb = data.absorbTipProcessingFee;
    const header = absorb
      ? 'Server,Gross Tips,Sessions'
      : 'Server,Gross Tips,Fee,Net,Sessions';
    const lines = data.directRows.map((r) =>
      absorb
        ? `${escapeCsv(r.staffName)},${(r.grossCents / 100).toFixed(2)},${r.sessionCount}`
        : `${escapeCsv(r.staffName)},${(r.grossCents / 100).toFixed(2)},${(r.feeCents / 100).toFixed(2)},${(r.netCents / 100).toFixed(2)},${r.sessionCount}`,
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tip-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function escapeCsv(s: string): string {
    if (s.includes(',') || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  if (loading || !data) {
    return (
      <div className="px-4 py-16 text-center text-sm text-gray-400">
        {loading ? 'Loading…' : 'No data'}
      </div>
    );
  }

  const openPools = data.pools.filter((p) => p.status === 'OPEN');
  const closedPools = data.pools.filter((p) => p.status === 'CLOSED');
  const donePools = data.pools.filter((p) => p.status === 'DISTRIBUTED');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Tip analytics</h1>
      <p className="text-sm text-gray-500 mb-6">
        Today&apos;s totals use your restaurant timezone ({data.timezone}).
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {data.tipDistributionMode === 'DIRECT' && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Direct mode — today</h2>
            <button
              type="button"
              onClick={downloadDirectCsv}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Download CSV
            </button>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Server</th>
                  {!data.absorbTipProcessingFee && (
                    <>
                      <th className="px-4 py-2 text-right">Gross</th>
                      <th className="px-4 py-2 text-right">Fee</th>
                      <th className="px-4 py-2 text-right">Net</th>
                    </>
                  )}
                  {data.absorbTipProcessingFee && <th className="px-4 py-2 text-right">Tips</th>}
                  <th className="px-4 py-2 text-right">Sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.directRows.map((r) => (
                  <tr key={r.staffId ?? 'unattributed'} className="bg-white">
                    <td className="px-4 py-2 font-medium text-gray-900">{r.staffName}</td>
                    {!data.absorbTipProcessingFee && (
                      <>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.grossCents)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-600">
                          −{formatMoney(r.feeCents)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {formatMoney(r.netCents)}
                        </td>
                      </>
                    )}
                    {data.absorbTipProcessingFee && (
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.grossCents)}</td>
                    )}
                    <td className="px-4 py-2 text-right text-gray-600">{r.sessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.directRows.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No captured tips yet today.</p>
            )}
          </div>
        </div>
      )}

      {data.tipDistributionMode === 'POOL' && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Tip pools</h2>
            {openPools.length === 0 && (
              <button
                type="button"
                disabled={acting !== null}
                onClick={openPool}
                className="text-xs px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {acting === 'open' ? 'Opening…' : 'Open new pool'}
              </button>
            )}
          </div>

          {openPools.map((p) => (
            <div key={p.id} className="border border-amber-200 bg-amber-50 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Open pool</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {formatMoney(p.totalAmountCents)} · {p.entryCount} entr{p.entryCount === 1 ? 'y' : 'ies'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={acting !== null}
                  onClick={() => closePool(p.id)}
                  className="text-xs px-3 py-1.5 bg-white border border-amber-300 rounded-lg hover:bg-amber-100"
                >
                  {acting === `close-${p.id}` ? 'Closing…' : 'Close pool'}
                </button>
              </div>
            </div>
          ))}

          {closedPools.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Closed — mark distributed</h3>
              <div className="space-y-2">
                {closedPools.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 rounded-xl px-4 py-3 bg-white"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{formatMoney(p.totalAmountCents)}</p>
                      <p className="text-xs text-gray-500">Closed {p.closedAt ? new Date(p.closedAt).toLocaleString() : '—'}</p>
                    </div>
                    <button
                      type="button"
                      disabled={acting !== null}
                      onClick={() => distributePool(p.id)}
                      className="text-xs px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800"
                    >
                      {acting === `dist-${p.id}` ? 'Saving…' : 'Mark distributed'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {donePools.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">History</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                {donePools.map((p) => (
                  <li key={p.id} className="border border-gray-100 rounded-lg px-3 py-2">
                    {formatMoney(p.totalAmountCents)} · distributed{' '}
                    {p.distributedAt ? new Date(p.distributedAt).toLocaleString() : '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
