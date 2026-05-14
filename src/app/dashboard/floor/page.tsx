'use client';

import { useCallback, useEffect, useState } from 'react';

import { PageShell, PageHead } from '@/components/pitch';

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

type FloorAssignmentDto = {
  tableId: string;
  staffId: string;
  table: { tableNumber: string };
};

export default function FloorPage() {
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingYesterday, setLoadingYesterday] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const loadFloor = useCallback(async () => {
    setLoadError('');
    setLoading(true);
    try {
      const [tablesRes, floorRes, staffRes] = await Promise.all([
        fetch('/api/restaurant/tables', { credentials: 'include' }),
        fetch('/api/restaurant/floor', { credentials: 'include' }),
        fetch('/api/restaurant/staff', { credentials: 'include' }),
      ]);

      if (!tablesRes.ok || !floorRes.ok) {
        if (floorRes.status === 403 || staffRes.status === 403) {
          setLoadError('You need Manager or Admin access to edit the floor.');
        } else {
          setLoadError('Could not load floor data.');
        }
        setTables([]);
        setStaff([]);
        return;
      }

      const { tables: dt } = (await tablesRes.json()) as {
        tables: { id: string; tableNumber: string }[];
      };
      const { assignments } = (await floorRes.json()) as { assignments: FloorAssignmentDto[] };
      const assignByTable = new Map<string, string>();
      for (const a of assignments) {
        if (!assignByTable.has(a.tableId)) assignByTable.set(a.tableId, a.staffId);
      }

      setTables(
        dt.map((t) => ({
          id: t.id,
          tableNumber: t.tableNumber,
          assignedStaffId: assignByTable.get(t.id) ?? null,
          isActive: true,
        })),
      );

      if (staffRes.ok) {
        const staffData = (await staffRes.json()) as {
          staff: { id: string; name: string; role: string; isActive: boolean }[];
        };
        setStaff(
          staffData.staff
            .filter((s) => s.isActive && (s.role === 'MANAGER' || s.role === 'STAFF'))
            .map((s) => ({ id: s.id, name: s.name, role: s.role as 'MANAGER' | 'STAFF' })),
        );
      } else {
        setStaff([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFloor();
  }, [loadFloor]);

  async function postAssignments(assignments: { tableId: string; staffId: string | null }[]) {
    const res = await fetch('/api/restaurant/floor', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === 'string' ? body.error : 'Save failed');
    }
  }

  async function assignStaff(tableId: string, staffId: string | null) {
    setSaving(tableId);
    setSuccessMsg('');
    const nextTables = tables.map((t) =>
      t.id === tableId ? { ...t, assignedStaffId: staffId || null } : t,
    );
    const assignments = nextTables.map((t) => ({
      tableId: t.id,
      staffId: t.assignedStaffId,
    }));
    try {
      await postAssignments(assignments);
      setTables(nextTables);
    } catch (e) {
      setSuccessMsg('');
      alert(e instanceof Error ? e.message : 'Could not save assignment');
      await loadFloor();
    } finally {
      setSaving(null);
    }
  }

  async function loadYesterdaysSetup() {
    setLoadingYesterday(true);
    setSuccessMsg('');
    try {
      const res = await fetch('/api/restaurant/floor/yesterday', { credentials: 'include' });
      if (!res.ok) {
        alert('Could not load yesterday’s assignments.');
        return;
      }
      const { assignments } = (await res.json()) as {
        assignments: { tableId: string; staffId: string }[];
      };
      const map = new Map(assignments.map((a) => [a.tableId, a.staffId]));
      const nextTables = tables.map((t) => ({
        ...t,
        assignedStaffId: map.get(t.id) ?? null,
      }));
      const payload = nextTables.map((t) => ({ tableId: t.id, staffId: t.assignedStaffId }));
      await postAssignments(payload);
      setTables(nextTables);
      setSuccessMsg("Yesterday's floor setup loaded.");
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      alert('Could not apply yesterday’s setup.');
      await loadFloor();
    } finally {
      setLoadingYesterday(false);
    }
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
              disabled={loadingYesterday || tables.length === 0}
              className="rounded-full border border-border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
            >
              {loadingYesterday ? 'Loading...' : 'Load yesterday'}
            </button>
          </div>
        }
      />

      {loadError && (
        <p className="mb-4 rounded-[14px] border border-destructive/30 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive">
          {loadError}
        </p>
      )}

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
                        ? 'Unassigned'
                        : `${assigned?.name ?? 'Server'} · ${assigned?.role === 'MANAGER' ? 'Manager' : 'Staff'}`}
                    </div>
                  </div>
                  <div className="mono mt-3 text-[10px]">
                    {saving === table.id ? 'Saving...' : table.assignedStaffId ? 'Assigned' : 'Available'}
                  </div>
                  <select
                    value={table.assignedStaffId ?? ''}
                    onChange={(e) => assignStaff(table.id, e.target.value || null)}
                    disabled={saving === table.id || staff.length === 0}
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
