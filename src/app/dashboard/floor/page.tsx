'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types — mirrors /api/restaurant/floor response
// TODO: import from src/lib/schemas/floor.ts once Michael ships it
// ---------------------------------------------------------------------------

type StaffOption = {
  id: string;
  name: string;
  role: 'MANAGER' | 'STAFF';
};

type FloorTable = {
  id: string;
  tableNumber: string;
  assignedStaffId: string | null;
  isActive: boolean;
};

// Mock data — TODO: replace with API fetch
const MOCK_STAFF: StaffOption[] = [
  { id: 's1', name: 'Jordan', role: 'STAFF' },
  { id: 's2', name: 'Alex',   role: 'STAFF' },
  { id: 's3', name: 'Sam',    role: 'MANAGER' },
];

const MOCK_TABLES: FloorTable[] = [
  { id: 'tbl-1', tableNumber: '1',    assignedStaffId: 's1', isActive: true },
  { id: 'tbl-2', tableNumber: '2',    assignedStaffId: 's1', isActive: true },
  { id: 'tbl-3', tableNumber: '3',    assignedStaffId: null, isActive: true },
  { id: 'tbl-4', tableNumber: '4',    assignedStaffId: 's2', isActive: true },
  { id: 'tbl-5', tableNumber: '5',    assignedStaffId: 's2', isActive: true },
  { id: 'tbl-6', tableNumber: '6',    assignedStaffId: null, isActive: true },
  { id: 'tbl-7', tableNumber: 'Bar 1',assignedStaffId: 's3', isActive: true },
];

export default function FloorPage() {
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingYesterday, setLoadingYesterday] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    // TODO: fetch from /api/restaurant/floor and /api/restaurant/staff
    setTables(MOCK_TABLES);
    setStaff(MOCK_STAFF);
    setLoading(false);
  }, []);

  async function assignStaff(tableId: string, staffId: string | null) {
    setSaving(tableId);
    // TODO: POST /api/restaurant/tables/[tableId]/assign { staffId }
    await new Promise((r) => setTimeout(r, 300));
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId ? { ...t, assignedStaffId: staffId } : t
      )
    );
    setSaving(null);
  }

  async function loadYesterdaysSetup() {
    setLoadingYesterday(true);
    // TODO: GET /api/restaurant/floor/yesterday → apply assignments
    await new Promise((r) => setTimeout(r, 600));
    setLoadingYesterday(false);
    setSuccessMsg("Yesterday's floor setup loaded.");
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const unassigned = tables.filter((t) => !t.assignedStaffId);

  const staffAssignments = staff.map((s) => ({
    ...s,
    tables: tables.filter((t) => t.assignedStaffId === s.id),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-6">
      <div className="mb-1 flex items-center justify-between gap-3 border-b border-border pb-4">
        <h1 className="font-display text-3xl font-light tracking-[-0.03em] text-foreground">Floor Setup</h1>
        <button
          type="button"
          onClick={loadYesterdaysSetup}
          disabled={loadingYesterday}
          className="rounded-full border border-border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
        >
          {loadingYesterday ? 'Loading...' : "Load yesterday's setup"}
        </button>
      </div>
      <p className="mb-6 font-body text-muted-foreground">
        Assign servers to tables. Tips are attributed to the assigned server.
      </p>

      {successMsg && (
        <p className="mb-4 rounded-[14px] border border-moss/40 bg-moss/10 px-4 py-3 font-body text-sm text-moss">
          {successMsg}
        </p>
      )}

      {/* Unassigned warning */}
      {unassigned.length > 0 && (
        <div className="mb-6 rounded-[14px] border border-primary/40 bg-amber-soft px-4 py-3">
          <p className="font-body text-sm font-medium text-primary">
            {unassigned.length} {unassigned.length === 1 ? 'table' : 'tables'} unassigned
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unassigned tables: {unassigned.map((t) => t.tableNumber).join(', ')}
          </p>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center font-body text-muted-foreground">Loading floor setup...</p>
      ) : (
        <>
          {/* Table assignment grid */}
          <h2 className="mb-3 font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            Assign tables
          </h2>
          <div className="mb-8 overflow-hidden rounded-[14px] border border-border bg-card divide-y divide-border">
            {tables.map((table) => (
              <div key={table.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="w-20 shrink-0 font-display text-[22px] font-light text-foreground">
                  Table {table.tableNumber}
                </p>
                <div className="flex flex-1 items-center justify-end gap-2">
                  {saving === table.id && (
                    <span className="font-mono text-[10px] text-muted-foreground">Saving...</span>
                  )}
                  {!table.assignedStaffId && (
                    <span className="mr-2 text-xs font-medium text-primary">Unassigned</span>
                  )}
                  <select
                    value={table.assignedStaffId ?? ''}
                    onChange={(e) => assignStaff(table.id, e.target.value || null)}
                    disabled={saving === table.id}
                    className="min-h-[44px] rounded-lg border border-border bg-scrim-2 px-3 py-2 font-body text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role === 'MANAGER' ? 'Manager' : 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Server summary */}
          <h2 className="mb-3 font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            Server assignments
          </h2>
          <div className="space-y-2.5">
            {staffAssignments.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-display text-[22px] font-light tracking-[-0.01em] text-foreground">{s.name}</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {s.tables.length} {s.tables.length === 1 ? 'table' : 'tables'}
                  </span>
                </div>
                {s.tables.length > 0 ? (
                  <p className="font-body text-sm text-muted-foreground">
                    {s.tables.map((t) => `Table ${t.tableNumber}`).join(', ')}
                  </p>
                ) : (
                  <p className="font-body text-sm text-muted-foreground/80">No tables assigned</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
