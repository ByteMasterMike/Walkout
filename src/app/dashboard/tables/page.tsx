'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { useRestaurantStream } from '@/hooks/useRestaurantStream';

type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLOSING';
type HoldStatus =
  | 'NONE'
  | 'PENDING'
  | 'HELD'
  | 'FAILED'
  | 'RELEASED'
  | 'EXPIRED'
  | 'REAUTHORIZING';

type LiveTable = {
  id: string;
  tableNumber: string;
  status: TableStatus;
  assignedServerName: string | null;
  coverCount: number;
  runningTotalCents: number;
  openedAt: string | null;
  hasOpenServiceRequest: boolean;
  hasFailedHold: boolean;
  hasCashParticipant: boolean;
  holdStatus: HoldStatus;
};

function elapsedLabel(openedAt: string | null): string {
  if (!openedAt) return '';
  const ms = Date.now() - new Date(openedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_RING: Record<TableStatus, string> = {
  AVAILABLE: 'ring-moss/50',
  OCCUPIED: 'ring-primary/50',
  CLOSING: 'ring-blood/50',
};

const STATUS_BG: Record<TableStatus, string> = {
  AVAILABLE: 'bg-card border-moss/30 hover:border-moss/50',
  OCCUPIED: 'bg-amber-soft border-amber-soft-line hover:border-primary/50',
  CLOSING: 'bg-destructive/10 border-destructive/40 hover:border-destructive/60',
};

const STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  CLOSING: 'Closing',
};

const CASH_BANNER_DISMISS_KEY = 'walkout:cash-banner-dismissed';

export default function TablesPage() {
  const { data: authSession } = useSession();
  const restaurantId = authSession?.user?.restaurantId ?? '';

  const [tables, setTables] = useState<LiveTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const [dismissedCashBanner, setDismissedCashBanner] = useState(false);

  const loadTables = useCallback(async () => {
    const res = await fetch('/api/restaurant/tables/live');
    if (res.ok) {
      const data = await res.json();
      setTables(data.tables as LiveTable[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTables();
    try {
      const raw = sessionStorage.getItem(CASH_BANNER_DISMISS_KEY);
      if (raw === '1') setDismissedCashBanner(true);
    } catch {
      /* ignore */
    }
  }, [loadTables]);

  useRestaurantStream({
    restaurantId,
    enabled: !!restaurantId,
    onEvent: (ev) => {
      if (ev.type === 'session_update' || ev.type === 'table_update') {
        loadTables();
      }
    },
  });

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const occupied = tables.filter((t) => t.status !== 'AVAILABLE').length;

  const cashAlertTables = tables.filter((t) => t.hasCashParticipant);
  const showCashBanner = cashAlertTables.length > 0 && !dismissedCashBanner;

  function dismissCashBanner() {
    setDismissedCashBanner(true);
    try {
      sessionStorage.setItem(CASH_BANNER_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6 flex max-w-4xl items-end justify-between gap-4 border-b border-border pb-6 mx-auto">
        <div>
          <h1 className="font-display text-3xl font-light tracking-[-0.03em] text-foreground md:text-4xl">
            Live Tables
          </h1>
          <p className="mt-2 font-body text-muted-foreground">
            {occupied} of {tables.length} tables occupied
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span>Live</span>
        </div>
      </div>

      {showCashBanner && (
        <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-start justify-between gap-3 rounded-[14px] border border-amber-soft-line bg-amber-soft px-4 py-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Cash payment — collect cash on the floor.</span>{' '}
            Tables:{' '}
            {cashAlertTables.map((t) => t.tableNumber).join(', ')}. Open each table to mark cash
            collected.
          </p>
          <button
            type="button"
            onClick={dismissCashBanner}
            className="shrink-0 rounded-lg border border-amber-soft-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground transition-colors hover:bg-primary/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center font-body text-muted-foreground">Loading tables...</p>
      ) : (
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}
    </div>
  );
}

function TableCard({ table }: { table: LiveTable }) {
  const elapsed = elapsedLabel(table.openedAt);

  return (
    <Link
      href={`/dashboard/tables/${table.id}`}
      className={`block min-h-[140px] rounded-[14px] border-2 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${STATUS_BG[table.status]} ring-2 ${STATUS_RING[table.status]}`}
    >
      <div className="mb-3 flex items-start justify-between">
        <span className="font-display text-[30px] font-light leading-none tracking-[-0.02em] text-foreground">
          {table.tableNumber}
        </span>
        <div className="flex flex-col items-end gap-1">
          {table.hasOpenServiceRequest && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Open service request" />
          )}
          {table.hasFailedHold && (
            <span className="h-1.5 w-1.5 rounded-full bg-destructive" title="Failed hold" />
          )}
          {table.hasCashParticipant && (
            <span className="font-mono text-[10px] text-muted-foreground" title="Cash payment">
              $
            </span>
          )}
        </div>
      </div>

      {table.status === 'AVAILABLE' ? (
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-moss">{STATUS_LABEL[table.status]}</p>
      ) : (
        <>
          <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-primary">{STATUS_LABEL[table.status]}</p>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {table.coverCount} {table.coverCount === 1 ? 'cover' : 'covers'} · {elapsed}
          </p>
          <p className="mt-1 font-display text-[22px] font-light text-primary">{formatCents(table.runningTotalCents)}</p>
        </>
      )}

      <div className="mt-2">
        {table.assignedServerName ? (
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {table.assignedServerName}
          </p>
        ) : table.status !== 'AVAILABLE' ? (
          <p className="text-sm font-medium text-primary">Unassigned</p>
        ) : null}
      </div>

      {table.hasFailedHold && (
        <p className="mt-2 text-xs font-medium text-destructive">Card declined</p>
      )}
    </Link>
  );
}
