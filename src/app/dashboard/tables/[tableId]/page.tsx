'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Types — mirrors /api/restaurant/tables/[tableId] response
// TODO: import from src/lib/schemas/tableDetail.ts once Michael ships it
// ---------------------------------------------------------------------------

type OrderItemStatus = 'PENDING' | 'CONFIRMED' | 'PREPPING' | 'SERVED' | 'CANCELLED';
type HoldStatus = 'NONE' | 'PENDING' | 'HELD' | 'FAILED' | 'RELEASED' | 'EXPIRED' | 'REAUTHORIZING';
type CaptureStatus = 'PENDING' | 'PROCESSING' | 'CAPTURED' | 'FAILED' | 'SKIPPED';
type ServiceReqStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';

type OrderItemRow = {
  id: string;
  menuItemName: string;
  quantity: number;
  unitPrice: string;
  taxAmount: string;
  notes: string | null;
  status: OrderItemStatus;
  allergens: string[];
};

type ServiceReqRow = {
  id: string;
  type: string;
  status: ServiceReqStatus;
  dinerName: string;
  createdAt: string;
  acknowledgedByName: string | null;
};

type ParticipantRow = {
  id: string;
  displayName: string;
  isHost: boolean;
  holdStatus: HoldStatus;
  captureStatus: CaptureStatus | null;
  orders: OrderItemRow[];
  subtotalCents: number;
};

type TableDetailData = {
  tableId: string;
  tableNumber: string;
  sessionId: string | null;
  participants: ParticipantRow[];
  serviceRequests: ServiceReqRow[];
};

const ORDER_STATUS_LABELS: Record<OrderItemStatus, string> = {
  PENDING:   'Pending',
  CONFIRMED: 'Confirmed',
  PREPPING:  'Preparing',
  SERVED:    'Served',
  CANCELLED: 'Cancelled',
};

const ORDER_STATUS_NEXT: Partial<Record<OrderItemStatus, OrderItemStatus>> = {
  PENDING:   'CONFIRMED',
  CONFIRMED: 'PREPPING',
  PREPPING:  'SERVED',
};

const ORDER_STATUS_STYLES: Record<OrderItemStatus, string> = {
  PENDING:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border-blue-200',
  PREPPING:  'bg-orange-50 text-orange-700 border-orange-200',
  SERVED:    'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-100 text-gray-400 border-gray-200',
};

const HOLD_STATUS_LABELS: Record<HoldStatus, string> = {
  NONE:          'No hold',
  PENDING:       'Hold pending',
  HELD:          'Hold active',
  FAILED:        'Card declined',
  RELEASED:      'Hold released',
  EXPIRED:       'Hold expired',
  REAUTHORIZING: 'Re-authorizing',
};

const HOLD_STATUS_STYLES: Record<HoldStatus, string> = {
  NONE:          'bg-gray-100 text-gray-500 border-gray-200',
  PENDING:       'bg-yellow-50 text-yellow-700 border-yellow-200',
  HELD:          'bg-green-50 text-green-700 border-green-200',
  FAILED:        'bg-red-50 text-red-700 border-red-200',
  RELEASED:      'bg-gray-100 text-gray-500 border-gray-200',
  EXPIRED:       'bg-orange-50 text-orange-700 border-orange-200',
  REAUTHORIZING: 'bg-blue-50 text-blue-700 border-blue-200',
};

const SERVICE_REQ_LABELS: Record<string, string> = {
  WATER: 'Water', REFILL: 'Refill drink', SILVERWARE: 'Silverware',
  EXTRA_PLATE: 'Extra plate', TOGO_CONTAINER: 'Togo box', HIGH_CHAIR: 'High chair',
  CLEAR_TABLE: 'Clear table', SPEAK_TO_SERVER: 'Speak to server', CLOSE_TAB: 'Close tab',
};

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// Mock data — TODO: replace with fetch once Michael ships the table detail API
function getMockDetail(tableId: string): TableDetailData {
  return {
    tableId,
    tableNumber: '2',
    sessionId: 'mock-session-1',
    participants: [
      {
        id: 'p1', displayName: 'Michael', isHost: true, holdStatus: 'HELD', captureStatus: null,
        subtotalCents: 4600,
        orders: [
          { id: 'o1', menuItemName: 'Ribeye Steak', quantity: 1, unitPrice: '44.00',
            taxAmount: '2.64', notes: 'medium rare', status: 'PREPPING', allergens: ['dairy'] },
          { id: 'o2', menuItemName: 'Lobster Bisque', quantity: 1, unitPrice: '12.00',
            taxAmount: '0.72', notes: null, status: 'SERVED', allergens: ['shellfish', 'dairy'] },
        ],
      },
      {
        id: 'p2', displayName: 'Sarah', isHost: false, holdStatus: 'FAILED', captureStatus: null,
        subtotalCents: 2500,
        orders: [
          { id: 'o3', menuItemName: 'Cheeseburger', quantity: 1, unitPrice: '14.00',
            taxAmount: '0.84', notes: 'no pickles', status: 'PREPPING', allergens: ['dairy', 'gluten'] },
          { id: 'o4', menuItemName: 'Caesar Salad', quantity: 1, unitPrice: '11.00',
            taxAmount: '0.66', notes: null, status: 'PENDING', allergens: ['dairy', 'gluten', 'egg'] },
        ],
      },
    ],
    serviceRequests: [
      { id: 'sr1', type: 'WATER', status: 'OPEN', dinerName: 'Michael',
        createdAt: new Date(Date.now() - 90000).toISOString(), acknowledgedByName: null },
    ],
  };
}

export default function TableDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [detail, setDetail] = useState<TableDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearingTable, setClearingTable] = useState(false);

  useEffect(() => {
    // TODO: fetch from /api/restaurant/tables/[tableId] + subscribe to useRestaurantStream
    setDetail(getMockDetail(tableId));
    setLoading(false);
  }, [tableId]);

  async function advanceOrderStatus(participantId: string, orderId: string, current: OrderItemStatus) {
    const next = ORDER_STATUS_NEXT[current];
    if (!next) return;
    // TODO: PATCH /api/sessions/[sessionId]/orders/[orderId] { status: next }
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        participants: prev.participants.map((p) =>
          p.id === participantId
            ? {
                ...p,
                orders: p.orders.map((o) =>
                  o.id === orderId ? { ...o, status: next } : o
                ),
              }
            : p
        ),
      };
    });
  }

  async function acknowledgeRequest(requestId: string) {
    // TODO: POST /api/restaurant/service-requests/[requestId]/acknowledge
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        serviceRequests: prev.serviceRequests.map((r) =>
          r.id === requestId ? { ...r, status: 'ACKNOWLEDGED' as ServiceReqStatus } : r
        ),
      };
    });
  }

  async function resolveRequest(requestId: string) {
    // TODO: POST /api/restaurant/service-requests/[requestId]/resolve
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        serviceRequests: prev.serviceRequests.map((r) =>
          r.id === requestId ? { ...r, status: 'RESOLVED' as ServiceReqStatus } : r
        ),
      };
    });
  }

  async function handleTableCleared() {
    if (!detail?.sessionId) return;
    setClearingTable(true);
    // TODO: POST /api/restaurant/sessions/[sessionId]/clear
    await new Promise((r) => setTimeout(r, 500));
    setClearingTable(false);
  }

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-gray-400">Loading table detail...</p>
      </div>
    );
  }

  const activeRequests = detail.serviceRequests.filter(
    (r) => r.status === 'OPEN' || r.status === 'ACKNOWLEDGED'
  );

  const failedHolds = detail.participants.filter((p) => p.holdStatus === 'FAILED');
  const expiredHolds = detail.participants.filter((p) => p.holdStatus === 'EXPIRED');
  const failedCaptures = detail.participants.filter((p) => p.captureStatus === 'FAILED');

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dashboard/tables" className="text-xs text-gray-400 hover:text-gray-600 mb-1 block">
            Back to tables
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Table {detail.tableNumber}</h1>
        </div>
        {detail.sessionId && (
          <button
            onClick={handleTableCleared}
            disabled={clearingTable}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {clearingTable ? 'Clearing...' : 'Table Cleared'}
          </button>
        )}
      </div>

      {/* Payment alert banners */}
      {failedHolds.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-red-900">
            Card declined — {failedHolds.map((p) => p.displayName).join(', ')}
          </p>
          <p className="text-xs text-red-700 mt-0.5">
            {failedHolds.length === 1 ? 'This guest' : 'These guests'} cannot place orders.
            Ask {failedHolds.length === 1 ? 'them' : 'each'} to provide an alternative card.
          </p>
        </div>
      )}
      {expiredHolds.length > 0 && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-orange-900">
            Hold expired — {expiredHolds.map((p) => p.displayName).join(', ')}
          </p>
          <p className="text-xs text-orange-700 mt-0.5">
            The auth hold needs re-authorization. The cron will retry automatically; manual
            action may be required from the Settlements page.
          </p>
        </div>
      )}
      {failedCaptures.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-red-900">
            Capture failed — {failedCaptures.map((p) => p.displayName).join(', ')}
          </p>
          <p className="text-xs text-red-700 mt-0.5">
            Payment could not be captured. Go to Settlements to retry or write off.
          </p>
        </div>
      )}

      {/* Service requests */}
      {activeRequests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Service Requests
          </h2>
          <div className="space-y-2">
            {activeRequests.map((req) => (
              <div key={req.id} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    {SERVICE_REQ_LABELS[req.type] ?? req.type} — {req.dinerName}
                  </p>
                  <p className="text-xs text-blue-500 mt-0.5">{elapsedLabel(req.createdAt)}</p>
                </div>
                <div className="flex gap-2 ml-4">
                  {req.status === 'OPEN' && (
                    <button
                      onClick={() => acknowledgeRequest(req.id)}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                  {req.status === 'ACKNOWLEDGED' && (
                    <button
                      onClick={() => resolveRequest(req.id)}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participants + orders */}
      {detail.participants.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No active session at this table.</p>
      ) : (
        <div className="space-y-6">
          {detail.participants.map((participant) => (
            <div key={participant.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{participant.displayName}</p>
                  {participant.isHost && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      Host
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${HOLD_STATUS_STYLES[participant.holdStatus]}`}
                >
                  {HOLD_STATUS_LABELS[participant.holdStatus]}
                </span>
              </div>

              {participant.orders.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No orders yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {participant.orders.map((order) => (
                    <div key={order.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">
                            {order.quantity > 1 && (
                              <span className="font-semibold">{order.quantity}x </span>
                            )}
                            {order.menuItemName}
                          </p>
                          {order.notes && (
                            <p className="text-xs text-gray-400 mt-0.5 italic">{order.notes}</p>
                          )}
                          {order.allergens.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {order.allergens.map((a) => (
                                <span
                                  key={a}
                                  className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full"
                                >
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-gray-500">
                            ${new Decimal(order.unitPrice).times(order.quantity).toFixed(2)}
                          </span>
                          {ORDER_STATUS_NEXT[order.status] ? (
                            <button
                              onClick={() => advanceOrderStatus(participant.id, order.id, order.status)}
                              className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors hover:opacity-80 ${ORDER_STATUS_STYLES[order.status]}`}
                            >
                              {ORDER_STATUS_LABELS[order.status]}
                            </button>
                          ) : (
                            <span
                              className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${ORDER_STATUS_STYLES[order.status]}`}
                            >
                              {ORDER_STATUS_LABELS[order.status]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
