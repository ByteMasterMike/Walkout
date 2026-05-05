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
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">Floor Setup</h1>
        <button
          onClick={loadYesterdaysSetup}
          disabled={loadingYesterday}
          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loadingYesterday ? 'Loading...' : "Load yesterday's setup"}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Assign servers to tables. Tips are attributed to the assigned server.
      </p>

      {successMsg && (
        <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {successMsg}
        </p>
      )}

      {/* Unassigned warning */}
      {unassigned.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-yellow-800">
            {unassigned.length} {unassigned.length === 1 ? 'table' : 'tables'} unassigned
          </p>
          <p className="text-xs text-yellow-600 mt-0.5">
            Unassigned tables: {unassigned.map((t) => t.tableNumber).join(', ')}
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading floor setup...</p>
      ) : (
        <>
          {/* Table assignment grid */}
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Assign tables
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 mb-8">
            {tables.map((table) => (
              <div key={table.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-medium text-gray-900 w-20 shrink-0">
                  Table {table.tableNumber}
                </p>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  {saving === table.id && (
                    <span className="text-xs text-gray-400">Saving...</span>
                  )}
                  {!table.assignedStaffId && (
                    <span className="text-xs text-yellow-600 font-medium mr-2">Unassigned</span>
                  )}
                  <select
                    value={table.assignedStaffId ?? ''}
                    onChange={(e) => assignStaff(table.id, e.target.value || null)}
                    disabled={saving === table.id}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white disabled:opacity-50"
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
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Server assignments
          </h2>
          <div className="space-y-3">
            {staffAssignments.map((s) => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                  <span className="text-xs text-gray-400">
                    {s.tables.length} {s.tables.length === 1 ? 'table' : 'tables'}
                  </span>
                </div>
                {s.tables.length > 0 ? (
                  <p className="text-xs text-gray-500">
                    {s.tables.map((t) => `Table ${t.tableNumber}`).join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">No tables assigned</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
