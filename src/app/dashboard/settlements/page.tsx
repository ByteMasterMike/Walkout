'use client';

import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Types — mirrors the settlements API response Michael will build.
// TODO: import from src/lib/schemas/settlements.ts once Michael ships it
// ---------------------------------------------------------------------------

type SettlementAction =
  | 'RETRY_HOLD'
  | 'RETRY_CAPTURE'
  | 'FORCE_20_CAPTURE'
  | 'WRITE_OFF'
  | 'REFUND'
  | 'REQUEST_NEW_CARD';

type SettlementIssue =
  | 'HOLD_FAILED'
  | 'HOLD_EXPIRED'
  | 'CAPTURE_FAILED'
  | 'CAPTURE_PARTIAL'
  | 'REFUND_REQUESTED';

type SettlementRow = {
  id: string;
  participantId: string;
  sessionId: string;
  tableNumber: string;
  dinerName: string;
  dinerEmail: string | null;
  issue: SettlementIssue;
  amountCents: number;
  holdAttempt: number;
  captureAttempt: number;
  occurredAt: string;
  availableActions: SettlementAction[];
};

const ISSUE_LABELS: Record<SettlementIssue, string> = {
  HOLD_FAILED:      'Hold declined',
  HOLD_EXPIRED:     'Hold expired',
  CAPTURE_FAILED:   'Capture failed',
  CAPTURE_PARTIAL:  'Partial capture',
  REFUND_REQUESTED: 'Refund requested',
};

const ISSUE_STYLES: Record<SettlementIssue, string> = {
  HOLD_FAILED:      'bg-red-50 text-red-700 border-red-200',
  HOLD_EXPIRED:     'bg-orange-50 text-orange-700 border-orange-200',
  CAPTURE_FAILED:   'bg-red-50 text-red-700 border-red-200',
  CAPTURE_PARTIAL:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  REFUND_REQUESTED: 'bg-blue-50 text-blue-700 border-blue-200',
};

const ACTION_LABELS: Record<SettlementAction, string> = {
  RETRY_HOLD:       'Retry hold',
  RETRY_CAPTURE:    'Retry capture',
  FORCE_20_CAPTURE: 'Force 20% tip + capture',
  WRITE_OFF:        'Write off',
  REFUND:           'Refund',
  REQUEST_NEW_CARD: 'Request new card',
};

const ACTION_STYLES: Record<SettlementAction, string> = {
  RETRY_HOLD:       'bg-gray-900 text-white hover:bg-gray-700',
  RETRY_CAPTURE:    'bg-gray-900 text-white hover:bg-gray-700',
  FORCE_20_CAPTURE: 'bg-amber-600 text-white hover:bg-amber-700',
  WRITE_OFF:        'border border-gray-300 text-gray-600 hover:bg-gray-50',
  REFUND:           'border border-blue-300 text-blue-700 hover:bg-blue-50',
  REQUEST_NEW_CARD: 'border border-gray-300 text-gray-600 hover:bg-gray-50',
};

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Mock data — TODO: replace with fetch('/api/restaurant/settlements') once
// Michael ships the endpoint and src/lib/schemas/settlements.ts
const MOCK_SETTLEMENTS: SettlementRow[] = [
  {
    id: 's1',
    participantId: 'p-abc',
    sessionId: 'sess-abc',
    tableNumber: '4',
    dinerName: 'Jordan Lee',
    dinerEmail: 'jordan@example.com',
    issue: 'CAPTURE_FAILED',
    amountCents: 6325,
    holdAttempt: 1,
    captureAttempt: 2,
    occurredAt: new Date(Date.now() - 18 * 60000).toISOString(),
    availableActions: ['RETRY_CAPTURE', 'FORCE_20_CAPTURE', 'WRITE_OFF'],
  },
  {
    id: 's2',
    participantId: 'p-def',
    sessionId: 'sess-def',
    tableNumber: 'Bar 2',
    dinerName: 'Sam Rivera',
    dinerEmail: null,
    issue: 'HOLD_FAILED',
    amountCents: 0,
    holdAttempt: 3,
    captureAttempt: 0,
    occurredAt: new Date(Date.now() - 47 * 60000).toISOString(),
    availableActions: ['WRITE_OFF', 'REQUEST_NEW_CARD'],
  },
  {
    id: 's3',
    participantId: 'p-ghi',
    sessionId: 'sess-ghi',
    tableNumber: '11',
    dinerName: 'Casey Park',
    dinerEmail: 'casey@example.com',
    issue: 'HOLD_EXPIRED',
    amountCents: 4800,
    holdAttempt: 2,
    captureAttempt: 0,
    occurredAt: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
    availableActions: ['RETRY_HOLD', 'WRITE_OFF'],
  },
];

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  // actioning format: `${rowId}-${action}`
  const [confirmRow, setConfirmRow] = useState<{ id: string; action: SettlementAction } | null>(null);

  useEffect(() => {
    // TODO: replace with fetch('/api/restaurant/settlements') once Michael ships
    setSettlements(MOCK_SETTLEMENTS);
    setLoading(false);
  }, []);

  async function handleAction(rowId: string, action: SettlementAction) {
    const destructive: SettlementAction[] = ['WRITE_OFF', 'FORCE_20_CAPTURE', 'REFUND'];
    if (destructive.includes(action)) {
      setConfirmRow({ id: rowId, action });
      return;
    }
    await executeAction(rowId, action);
  }

  async function executeAction(rowId: string, action: SettlementAction) {
    setConfirmRow(null);
    setActioning(`${rowId}-${action}`);
    // TODO: POST /api/restaurant/settlements/[participantId]/action { action }
    await new Promise((r) => setTimeout(r, 600));
    setSettlements((prev) => prev.filter((s) => s.id !== rowId));
    setActioning(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-gray-400">Loading settlements...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Pending Settlements</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Payment issues that need manual resolution. All actions are permanent.
        </p>
      </div>

      {settlements.length === 0 ? (
        <div className="text-center py-16 border border-gray-100 rounded-2xl bg-gray-50">
          <p className="text-sm font-medium text-gray-900">All clear</p>
          <p className="text-xs text-gray-400 mt-1">No pending payment issues.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((row) => {
            const isActioning = actioning?.startsWith(row.id);
            return (
              <div
                key={row.id}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
              >
                {/* Row header */}
                <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">
                        Table {row.tableNumber} — {row.dinerName}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ISSUE_STYLES[row.issue]}`}
                      >
                        {ISSUE_LABELS[row.issue]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {row.dinerEmail && <span>{row.dinerEmail}</span>}
                      <span>{elapsedLabel(row.occurredAt)}</span>
                      {row.holdAttempt > 0 && (
                        <span>Hold attempt {row.holdAttempt}</span>
                      )}
                      {row.captureAttempt > 0 && (
                        <span>Capture attempt {row.captureAttempt}</span>
                      )}
                    </div>
                  </div>

                  {row.amountCents > 0 && (
                    <span className="text-sm font-semibold text-gray-900 shrink-0 ml-4">
                      ${new Decimal(row.amountCents).dividedBy(100).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="px-5 py-3 flex flex-wrap gap-2">
                  {row.availableActions.map((action) => {
                    const key = `${row.id}-${action}`;
                    return (
                      <button
                        key={action}
                        onClick={() => handleAction(row.id, action)}
                        disabled={!!isActioning}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${ACTION_STYLES[action]}`}
                      >
                        {actioning === key ? 'Working...' : ACTION_LABELS[action]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Destructive action confirmation modal */}
      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmRow(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl px-6 py-5 max-w-sm w-full mx-4">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Confirm: {ACTION_LABELS[confirmRow.action]}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              This action cannot be undone. Are you sure you want to proceed?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRow(null)}
                className="flex-1 py-2.5 border border-gray-300 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeAction(confirmRow.id, confirmRow.action)}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
