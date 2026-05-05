'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types — mirrors /api/restaurant/tables (live) response shape
// TODO: import from src/lib/schemas/tables.ts once Michael ships it
// ---------------------------------------------------------------------------

type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLOSING';
type HoldStatus = 'NONE' | 'PENDING' | 'HELD' | 'FAILED' | 'RELEASED' | 'EXPIRED' | 'REAUTHORIZING';

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
  AVAILABLE: 'ring-green-400',
  OCCUPIED:  'ring-amber-400',
  CLOSING:   'ring-red-400',
};

const STATUS_BG: Record<TableStatus, string> = {
  AVAILABLE: 'bg-green-50',
  OCCUPIED:  'bg-amber-50',
  CLOSING:   'bg-red-50',
};

const STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: 'Available',
  OCCUPIED:  'Occupied',
  CLOSING:   'Closing',
};

// Mock data — remove when wiring to /api/restaurant/tables (SSE)
// TODO: replace with useRestaurantStream hook once Michael ships
//       /api/restaurant/stream in src/app/api/restaurant/stream/route.ts
const MOCK_TABLES: LiveTable[] = [
  {
    id: 'tbl-1', tableNumber: '1', status: 'AVAILABLE',
    assignedServerName: 'Jordan', coverCount: 0, runningTotalCents: 0,
    openedAt: null, hasOpenServiceRequest: false, hasFailedHold: false, hasCashParticipant: false, holdStatus: 'NONE',
  },
  {
    id: 'tbl-2', tableNumber: '2', status: 'OCCUPIED',
    assignedServerName: 'Alex', coverCount: 3, runningTotalCents: 6450,
    openedAt: new Date(Date.now() - 28 * 60000).toISOString(),
    hasOpenServiceRequest: true, hasFailedHold: false, hasCashParticipant: false, holdStatus: 'HELD',
  },
  {
    id: 'tbl-3', tableNumber: '3', status: 'OCCUPIED',
    assignedServerName: null, coverCount: 2, runningTotalCents: 3200,
    openedAt: new Date(Date.now() - 14 * 60000).toISOString(),
    hasOpenServiceRequest: false, hasFailedHold: true, hasCashParticipant: false, holdStatus: 'FAILED',
  },
  {
    id: 'tbl-4', tableNumber: 'Bar 1', status: 'OCCUPIED',
    assignedServerName: 'Sam', coverCount: 1, runningTotalCents: 1800,
    openedAt: new Date(Date.now() - 55 * 60000).toISOString(),
    hasOpenServiceRequest: false, hasFailedHold: false, hasCashParticipant: true, holdStatus: 'NONE',
  },
  {
    id: 'tbl-5', tableNumber: '5', status: 'CLOSING',
    assignedServerName: 'Jordan', coverCount: 4, runningTotalCents: 12300,
    openedAt: new Date(Date.now() - 72 * 60000).toISOString(),
    hasOpenServiceRequest: false, hasFailedHold: false, hasCashParticipant: false, holdStatus: 'HELD',
  },
  {
    id: 'tbl-6', tableNumber: '6', status: 'AVAILABLE',
    assignedServerName: 'Alex', coverCount: 0, runningTotalCents: 0,
    openedAt: null, hasOpenServiceRequest: false, hasFailedHold: false, hasCashParticipant: false, holdStatus: 'NONE',
  },
];

export default function TablesPage() {
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    // TODO: replace with /api/restaurant/tables fetch + useRestaurantStream SSE hook
    setTables(MOCK_TABLES);
    setLoading(false);

    // Refresh elapsed timers every 30 seconds
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const occupied = tables.filter((t) => t.status !== 'AVAILABLE').length;

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Live Tables</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {occupied} of {tables.length} tables occupied
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          <span>Live</span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-16">Loading tables...</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-4xl mx-auto">
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
      className={`block rounded-2xl border-2 p-4 transition-all hover:shadow-md ${STATUS_BG[table.status]} ring-2 ${STATUS_RING[table.status]}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-lg font-bold text-gray-900">{table.tableNumber}</span>
        <div className="flex flex-col items-end gap-1">
          {table.hasOpenServiceRequest && (
            <span className="w-2 h-2 rounded-full bg-blue-500" title="Open service request" />
          )}
          {table.hasFailedHold && (
            <span className="w-2 h-2 rounded-full bg-orange-500" title="Failed hold" />
          )}
          {table.hasCashParticipant && (
            <span className="text-xs text-gray-500" title="Cash payment">$</span>
          )}
        </div>
      </div>

      {table.status === 'AVAILABLE' ? (
        <p className="text-xs text-green-700 font-medium">{STATUS_LABEL[table.status]}</p>
      ) : (
        <>
          <p className="text-xs font-medium text-gray-900">{STATUS_LABEL[table.status]}</p>
          <p className="text-xs text-gray-500 mt-1">
            {table.coverCount} {table.coverCount === 1 ? 'cover' : 'covers'} &middot; {elapsed}
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-1">
            {formatCents(table.runningTotalCents)}
          </p>
        </>
      )}

      <div className="mt-2">
        {table.assignedServerName ? (
          <p className="text-xs text-gray-500 truncate">{table.assignedServerName}</p>
        ) : table.status !== 'AVAILABLE' ? (
          <p className="text-xs text-yellow-600 font-medium">Unassigned</p>
        ) : null}
      </div>

      {table.hasFailedHold && (
        <p className="text-xs text-orange-700 mt-1 font-medium">Card declined</p>
      )}
    </Link>
  );
}
