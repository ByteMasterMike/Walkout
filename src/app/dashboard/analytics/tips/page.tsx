'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageShell, PageHead, KpiStrip } from '@/components/pitch';

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
  rollingDays: number;
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
  const [rollingDays, setRollingDays] = useState(7);

  const load = useCallback(async () => {
    setError('');
    const res = await fetch(`/api/restaurant/tip-pool?days=${rollingDays}`);
    if (!res.ok) {
      setError('Could not load tip data');
      setLoading(false);
      return;
    }
    const json = (await res.json()) as TipPayload;
    setData(json);
    setLoading(false);
  }, [rollingDays]);

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
      <PageShell>
        <p className="py-16 text-center text-sm text-muted-foreground">{loading ? 'Loading…' : 'No data'}</p>
      </PageShell>
    );
  }

  const openPools = data.pools.filter((p) => p.status === 'OPEN');
  const closedPools = data.pools.filter((p) => p.status === 'CLOSED');
  const donePools = data.pools.filter((p) => p.status === 'DISTRIBUTED');

  const maxGross = Math.max(1, ...data.directRows.map((r) => r.grossCents));
  const rangeSummary =
    data.rollingDays === 1 ? 'Today' : `Last ${data.rollingDays} days`;

  return (
    <PageShell>
      <PageHead
        title={
          <>
            Tip <em>analytics</em>
          </>
        }
        subtitle={
          <>
            Captured direct tips are summed over the last {data.rollingDays}{' '}
            {data.rollingDays === 1 ? 'day' : 'days'} (restaurant midnight to midnight in{' '}
            {data.timezone}), through today.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="mono text-muted-foreground">Range</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={rollingDays}
                onChange={(e) => setRollingDays(Number(e.target.value))}
              >
                <option value={1}>Today</option>
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </label>
            <div className="flex items-center gap-2">
              <span className="mono text-muted-foreground">Mode</span>
              <span className="codeline">{data.tipDistributionMode}</span>
            </div>
          </div>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <KpiStrip
        items={[
          {
            label: 'Tips (direct rows)',
            value: formatMoney(data.directRows.reduce((s, r) => s + r.grossCents, 0)),
            detail: `${data.directRows.length} servers`,
          },
          {
            label: 'Highest',
            value:
              data.directRows.length > 0
                ? formatMoney(Math.max(...data.directRows.map((r) => r.grossCents)))
                : '—',
            detail: rangeSummary,
          },
          { label: 'Pools open', value: String(openPools.length), detail: 'Shift totals' },
          {
            label: 'Mode',
            value: <em>{data.tipDistributionMode}</em>,
            detail: data.absorbTipProcessingFee ? 'Absorb fee on' : 'Absorb fee off',
          },
        ]}
      />

      {data.tipDistributionMode === 'DIRECT' && (
        <div className="mt-40">
          <div className="mb-2 flex items-center justify-between">
            <div className="mono">By server · {rangeSummary.toLowerCase()}</div>
            <button
              type="button"
              onClick={downloadDirectCsv}
              className="rounded-full border border-border px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              Download CSV
            </button>
          </div>
          <div className="tip-list">
            {data.directRows.map((r) => {
              const pct = Math.round((r.grossCents / maxGross) * 100);
              const initials = r.staffName
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <div key={r.staffId ?? r.staffName} className="trow">
                  <div className="av">{initials || '?'}</div>
                  <div className="nm">{r.staffName}</div>
                  <div className="bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="amt">
                    {!data.absorbTipProcessingFee ? formatMoney(r.netCents) : formatMoney(r.grossCents)}
                  </div>
                  <div className="cnt">{r.sessionCount} tabs</div>
                </div>
              );
            })}
          </div>
          {data.directRows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No captured tips in this range yet.
            </p>
          )}
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
    </PageShell>
  );
}
