'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { useRestaurantStream } from '@/hooks/useRestaurantStream';
import { PageShell, PageHead, PageHeadMetaDot } from '@/components/pitch';

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

const STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  CLOSING: 'Closing',
};

const CASH_BANNER_DISMISS_KEY = 'walkout:cash-banner-dismissed';

function tTileModifier(status: TableStatus): string {
  if (status === 'OCCUPIED') return 'occ';
  if (status === 'CLOSING') return 'close';
  return '';
}

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
    <PageShell>
      <PageHead
        title={
          <>
            Live <em>tables</em>
          </>
        }
        subtitle={<>Every tab in the room — opens, holds, totals, who&apos;s about to walk.</>}
        meta={
          <>
            <PageHeadMetaDot />
            Live · {occupied} / {tables.length || '—'} occupied
          </>
        }
      />

      {showCashBanner && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[14px] border border-amber-soft-line bg-amber-soft px-4 py-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Cash payment — collect cash on the floor.</span>{' '}
            Tables: {cashAlertTables.map((t) => t.tableNumber).join(', ')}. Open each table to mark cash
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
        <div className="tables-grid">
          {tables.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function TableCard({ table }: { table: LiveTable }) {
  const elapsed = elapsedLabel(table.openedAt);
  const mod = tTileModifier(table.status);

  return (
    <Link
      href={`/dashboard/tables/${table.id}`}
      className={`t-tile !no-underline ${mod}`.trim()}
    >
      <div className="top">
        <div className="num">
          {table.status === 'AVAILABLE' ? table.tableNumber : <em>{table.tableNumber}</em>}
        </div>
        <div className="state">
          <span className="d" />
          {STATUS_LABEL[table.status]}
        </div>
      </div>
      {(table.hasOpenServiceRequest || table.hasFailedHold || table.hasCashParticipant) && (
        <div className="flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          {table.hasOpenServiceRequest ? <span>Request</span> : null}
          {table.hasFailedHold ? <span className="text-destructive">Hold</span> : null}
          {table.hasCashParticipant ? <span className="text-primary">Cash</span> : null}
        </div>
      )}

      {table.status === 'AVAILABLE' ? null : (
        <>
          <div className="who">
            {table.coverCount} {table.coverCount === 1 ? 'cover' : 'covers'} · {elapsed}
          </div>
          <div className="total">{formatCents(table.runningTotalCents)}</div>
          <div className="server">
            {table.assignedServerName
              ? `${table.assignedServerName} · live`
              : 'Unassigned · live'}
          </div>
        </>
      )}

      {table.hasFailedHold ? (
        <p className="font-body text-xs font-medium text-destructive">Card declined</p>
      ) : null}
    </Link>
  );
}
