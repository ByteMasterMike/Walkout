'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useRestaurantStream } from '@/hooks/useRestaurantStream';
import type { TodayAnalytics } from '@/lib/analytics/today';

type LiveTable = {
  id: string;
  tableNumber: string;
  status: string;
  coverCount: number;
  runningTotalCents: number;
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function DashboardOverviewClient({
  role,
  userName,
  restaurantId,
  initialAnalytics,
  showOnboardingBanner,
}: {
  role: 'ADMIN' | 'MANAGER';
  userName: string;
  restaurantId: string;
  initialAnalytics: TodayAnalytics;
  showOnboardingBanner: boolean;
}) {
  const { data: session } = useSession();
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);

  const refreshAnalytics = useCallback(async () => {
    const res = await fetch('/api/restaurant/analytics/today');
    if (res.ok) {
      const data = (await res.json()) as TodayAnalytics;
      setAnalytics(data);
    }
  }, []);

  const loadTables = useCallback(async () => {
    const res = await fetch('/api/restaurant/tables/live');
    if (res.ok) {
      const data = await res.json();
      setTables(data.tables as LiveTable[]);
    }
    setTablesLoading(false);
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useRestaurantStream({
    restaurantId,
    enabled: !!session?.user?.restaurantId,
    onEvent: (ev) => {
      if (ev.type === 'session_update' || ev.type === 'table_update') {
        loadTables();
        refreshAnalytics();
      }
    },
  });

  const chartData = useMemo(() => {
    const labels = ['−6d', '−5d', '−4d', '−3d', '−2d', '−1d', 'Today'];
    return analytics.last7DaysCents.map((cents, i) => ({
      label: labels[i] ?? `${i}`,
      revenue: cents / 100,
    }));
  }, [analytics.last7DaysCents]);

  const now = new Date();
  const utcMonth = now.getUTCMonth() + 1;
  const utcYear = now.getUTCFullYear();
  const quarter = Math.ceil(utcMonth / 3);
  const taxCsvHref = `/api/restaurant/analytics/tax/quarterly?year=${utcYear}&quarter=${quarter}`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {userName} · <span className="font-medium text-gray-700">{role}</span>
        </p>
      </header>

      {showOnboardingBanner && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <span>Finish restaurant onboarding to go live with confidence.</span>
          <Link
            href="/dashboard/onboarding"
            className="font-semibold underline underline-offset-2 hover:text-amber-900"
          >
            Continue setup →
          </Link>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Today's revenue" value={formatUsd(analytics.revenueCents)} />
        <KpiCard title="Covers (closed tabs)" value={String(analytics.covers)} />
        <KpiCard title="Tips collected" value={formatUsd(analytics.tipsCents)} />
        <KpiCard title="Tax owed (QTD)" value={formatUsd(analytics.taxQtdCents)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Last 7 days — food subtotal</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  width={48}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Subtotal']} />
                <Bar dataKey="revenue" fill="#171717" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Live tables</h2>
            <Link href="/dashboard/tables" className="text-xs font-medium text-gray-600 hover:text-gray-900">
              Open grid →
            </Link>
          </div>
          {tablesLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : tables.length === 0 ? (
            <p className="text-sm text-gray-500">No tables configured.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tables.map((t) => (
                <Link
                  key={t.id}
                  href={`/dashboard/tables/${t.id}`}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    t.status === 'AVAILABLE'
                      ? 'border-green-200 bg-green-50 text-green-900'
                      : t.status === 'CLOSING'
                        ? 'border-red-200 bg-red-50 text-red-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <span>T{t.tableNumber}</span>
                  <span className="text-gray-600">
                    {t.coverCount} covers · {formatUsd(t.runningTotalCents)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Tax summary</h2>
          <p className="text-xs text-gray-500 mt-1">
            Quarterly CSV uses snapshotted <code className="font-mono text-[11px]">OrderItem.taxAmount</code> only.
          </p>
        </div>
        <a
          href={taxCsvHref}
          className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Download Q{quarter} {utcYear} CSV
        </a>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {role === 'ADMIN' && (
          <>
            <DashLink href="/dashboard/setup" label="Table setup" description="Tables & NFC tags" />
            <DashLink href="/dashboard/setup/staff" label="Staff" description="Invite team members" />
          </>
        )}
        {(role === 'ADMIN' || role === 'MANAGER') && (
          <DashLink href="/dashboard/floor" label="Floor setup" description="Assign servers" />
        )}
        <DashLink href="/dashboard/tables" label="Live tables" description="Real-time floor" />
        <DashLink href="/dashboard/kitchen" label="Kitchen display" description="KDS queue" />
        <DashLink href="/dashboard/requests" label="Service requests" description="Diner calls" />
      </section>

      <p className="text-xs text-gray-400">
        Restaurant ID: <span className="font-mono">{restaurantId}</span>
      </p>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function DashLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-gray-400 hover:shadow-sm transition-all"
    >
      <p className="font-semibold text-gray-900 text-sm">{label}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </Link>
  );
}
