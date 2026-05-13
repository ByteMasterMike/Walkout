'use client';

import { useEffect, useState } from 'react';

import { PageShell, PageHead } from '@/components/pitch';

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
  { id: 's2', name: 'Alex', role: 'STAFF' },
  { id: 's3', name: 'Sam', role: 'MANAGER' },
];

const MOCK_TABLES: FloorTable[] = [
  { id: 'tbl-1', tableNumber: '1', assignedStaffId: 's1', isActive: true },
  { id: 'tbl-2', tableNumber: '2', assignedStaffId: 's1', isActive: true },
  { id: 'tbl-3', tableNumber: '3', assignedStaffId: null, isActive: true },
  { id: 'tbl-4', tableNumber: '4', assignedStaffId: 's2', isActive: true },
  { id: 'tbl-5', tableNumber: '5', assignedStaffId: 's2', isActive: true },
  { id: 'tbl-6', tableNumber: '6', assignedStaffId: null, isActive: true },
  { id: 'tbl-7', tableNumber: 'Bar 1', assignedStaffId: 's3', isActive: true },
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
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, assignedStaffId: staffId } : t)));
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

  function savePlan() {
    setSuccessMsg('Save plan — TODO: wire API');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const unassigned = tables.filter((t) => !t.assignedStaffId);

  const staffAssignments = staff.map((s) => ({
    ...s,
    tables: tables.filter((t) => t.assignedStaffId === s.id),
  }));

  return (
    <PageShell>
      <PageHead
        title={
          <>
            Floor <em>setup</em>
          </>
        }
        subtitle={<>Assign servers to tables before service. Tap a table to reassign.</>}
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={loadYesterdaysSetup}
              disabled={loadingYesterday}
              className="rounded-full border border-border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
            >
              {loadingYesterday ? 'Loading...' : 'Load yesterday'}
            </button>
            <button
              type="button"
              onClick={savePlan}
              className="rounded-full bg-primary px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-primary-foreground transition-colors hover:bg-amber-light"
            >
              Save plan
            </button>
          </div>
        }
      />

      {successMsg && (
        <p className="mb-4 rounded-[14px] border border-moss/40 bg-moss/10 px-4 py-3 font-body text-sm text-moss">
          {successMsg}
        </p>
      )}

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
          <h2 className="mono mb-3" style={{ marginBottom: '14px' }}>
            Assign tables
          </h2>
          <div className="floor-grid mb-10">
            {tables.map((table) => {
              const assigned = staff.find((s) => s.id === table.assignedStaffId);
              return (
                <div
                  key={table.id}
                  className={`floor-tile ${!table.assignedStaffId ? 'unassigned' : ''}`.trim()}
                >
                  <div>
                    <div className="tn">{table.tableNumber}</div>
                    <div className="as">
                      {!table.assignedStaffId
                        ? 'No active session'
                        : `${assigned?.name ?? 'Server'} · ${assigned?.role === 'MANAGER' ? 'Manager' : 'Staff'}`}
                    </div>
                  </div>
                  <div className="mono mt-3 text-[10px]">
                    {saving === table.id ? 'Saving...' : table.assignedStaffId ? 'Live' : 'Available'}
                  </div>
                  <select
                    value={table.assignedStaffId ?? ''}
                    onChange={(e) => assignStaff(table.id, e.target.value || null)}
                    disabled={saving === table.id}
                    className="mt-3 min-h-[40px] w-full rounded-lg border border-border bg-background px-2 py-1 font-body text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role === 'MANAGER' ? 'Manager' : 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <h2 className="mono mb-3">Server assignments</h2>
          <div className="staff-list">
            {staffAssignments.map((s) => (
              <div key={s.id} className="staff-row">
                <div className="l">
                  <div className="av">{s.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="nm">{s.name}</div>
                    <div className="em">
                      {s.tables.length} {s.tables.length === 1 ? 'table' : 'tables'}
                      {s.tables.length > 0
                        ? ` · ${s.tables.map((t) => `Table ${t.tableNumber}`).join(', ')}`
                        : ''}
                    </div>
                  </div>
                </div>
                <span className="role">{s.role === 'MANAGER' ? 'Manager' : 'Staff'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
