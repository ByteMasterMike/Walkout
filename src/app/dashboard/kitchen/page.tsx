'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types — mirrors /api/restaurant/stream order_item events
// TODO: wire to useRestaurantStream hook once Michael ships
//       /api/restaurant/stream in src/app/api/restaurant/stream/route.ts
// ---------------------------------------------------------------------------

type OrderItemStatus = 'PENDING' | 'CONFIRMED' | 'PREPPING' | 'SERVED' | 'CANCELLED' | 'CASH_PENDING';

type KdsTile = {
  tableNumber: string;
  participantName: string;
  dietaryNotes: string | null;
  openedAt: string;
  items: KdsItem[];
};

type KdsItem = {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  status: OrderItemStatus;
  allergens: string[];
  updatedAt: string;
};

const STATUS_NEXT: Partial<Record<OrderItemStatus, OrderItemStatus>> = {
  PENDING:   'PREPPING',
  CONFIRMED: 'PREPPING',
  PREPPING:  'SERVED',
};

const STATUS_LABEL: Record<OrderItemStatus, string> = {
  PENDING:      'Tap to start',
  CONFIRMED:    'Tap to start',
  PREPPING:     'Prepping',
  SERVED:       'Served',
  CANCELLED:    'Cancelled',
  CASH_PENDING: 'Cash payment',
};

function getTileKey(tile: KdsTile): string {
  return `${tile.tableNumber}__${tile.participantName}`;
}

function tileColorClass(tile: KdsTile): string {
  const statuses = tile.items.map((i) => i.status);
  if (statuses.includes('CASH_PENDING')) return 'border-red-500 bg-red-50';
  if (statuses.every((s) => s === 'SERVED' || s === 'CANCELLED')) return 'border-green-400 bg-green-50';
  if (statuses.some((s) => s === 'PREPPING')) return 'border-orange-400 bg-orange-50';
  return 'border-yellow-400 bg-yellow-50';
}

function itemStatusClass(status: OrderItemStatus): string {
  const map: Record<OrderItemStatus, string> = {
    PENDING:      'bg-yellow-100 text-yellow-800',
    CONFIRMED:    'bg-yellow-100 text-yellow-800',
    PREPPING:     'bg-orange-100 text-orange-800',
    SERVED:       'bg-green-100 text-green-800',
    CANCELLED:    'bg-gray-100 text-gray-400',
    CASH_PENDING: 'bg-red-100 text-red-700',
  };
  return map[status];
}

function elapsedMs(iso: string): number {
  return Date.now() - new Date(iso).getTime();
}

function elapsedLabel(iso: string): string {
  const ms = elapsedMs(iso);
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `0:${String(secs).padStart(2, '0')}`;
}

function elapsedColorClass(iso: string): string {
  const mins = elapsedMs(iso) / 60000;
  if (mins >= 10) return 'text-red-600 font-bold';
  if (mins >= 5)  return 'text-amber-600 font-semibold';
  return 'text-gray-400';
}

// Mock tiles — TODO: replace with useRestaurantStream subscription
// IMPORTANT: this component must explicitly ignore SSE events with type='service_request'
const MOCK_TILES: KdsTile[] = [
  {
    tableNumber: '2', participantName: 'Michael',
    dietaryNotes: 'nut allergy',
    openedAt: new Date(Date.now() - 4 * 60000).toISOString(),
    items: [
      { id: 'o1', name: 'Ribeye Steak', quantity: 1, notes: 'medium rare', status: 'PREPPING',
        allergens: ['dairy'], updatedAt: new Date(Date.now() - 3 * 60000).toISOString() },
      { id: 'o2', name: 'Lobster Bisque', quantity: 1, notes: null, status: 'SERVED',
        allergens: ['shellfish', 'dairy'], updatedAt: new Date(Date.now() - 2 * 60000).toISOString() },
    ],
  },
  {
    tableNumber: '2', participantName: 'Sarah',
    dietaryNotes: null,
    openedAt: new Date(Date.now() - 2 * 60000).toISOString(),
    items: [
      { id: 'o3', name: 'Cheeseburger', quantity: 1, notes: 'no pickles', status: 'PENDING',
        allergens: ['dairy', 'gluten'], updatedAt: new Date(Date.now() - 2 * 60000).toISOString() },
      { id: 'o4', name: 'Caesar Salad', quantity: 1, notes: null, status: 'PENDING',
        allergens: ['dairy', 'gluten'], updatedAt: new Date(Date.now() - 2 * 60000).toISOString() },
    ],
  },
  {
    tableNumber: 'Bar 1', participantName: 'Guest',
    dietaryNotes: 'vegan',
    openedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    items: [
      { id: 'o5', name: 'Caesar Salad', quantity: 2, notes: 'no cheese, no croutons', status: 'CASH_PENDING',
        allergens: [], updatedAt: new Date(Date.now() - 11 * 60000).toISOString() },
    ],
  },
];

export default function KitchenPage() {
  const [tiles, setTiles] = useState<KdsTile[]>([]);
  const [, setTick] = useState(0);
  const servedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    // TODO: replace with useRestaurantStream hook
    // CRITICAL: when wiring SSE, filter OUT events where event.type === 'service_request'
    // — service requests must never appear on the KDS (PRD §15.1)
    setTiles(MOCK_TILES);

    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  function advanceItem(tileKey: string, itemId: string, current: OrderItemStatus) {
    const next = STATUS_NEXT[current];
    if (!next) return;

    setTiles((prev) =>
      prev.map((tile) => {
        if (getTileKey(tile) !== tileKey) return tile;
        return {
          ...tile,
          items: tile.items.map((item) =>
            item.id === itemId ? { ...item, status: next, updatedAt: new Date().toISOString() } : item
          ),
        };
      })
    );

    // Auto-fade SERVED items after 60 seconds
    if (next === 'SERVED') {
      const timer = setTimeout(() => {
        setTiles((prev) =>
          prev
            .map((tile) => {
              if (getTileKey(tile) !== tileKey) return tile;
              return {
                ...tile,
                items: tile.items.filter((item) => item.id !== itemId),
              };
            })
            .filter((tile) => tile.items.length > 0)
        );
        servedTimers.current.delete(itemId);
      }, 60000);
      servedTimers.current.set(itemId, timer);
    }
  }

  const activeTiles = tiles.filter((tile) =>
    tile.items.some((i) => i.status !== 'CANCELLED')
  );

  return (
    <div className="min-h-screen bg-gray-950 p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-sm font-semibold tracking-wide uppercase">
          Kitchen Display
        </h1>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          {/* TODO: show SSE connection status */}
          <span>Live</span>
        </div>
      </div>

      {activeTiles.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-600 text-sm">No active orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {activeTiles.map((tile) => (
            <div
              key={getTileKey(tile)}
              className={`rounded-xl border-2 p-3 ${tileColorClass(tile)}`}
            >
              {/* Tile header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    Table {tile.tableNumber}
                  </p>
                  <p className="text-xs text-gray-600">{tile.participantName}</p>
                </div>
                <span className={`text-xs font-mono ${elapsedColorClass(tile.openedAt)}`}>
                  {elapsedLabel(tile.openedAt)}
                </span>
              </div>

              {/* Dietary notes */}
              {tile.dietaryNotes && (
                <p className="text-xs text-red-700 font-medium mb-2">
                  Dietary: {tile.dietaryNotes}
                </p>
              )}

              <div className="border-t border-black/10 my-2" />

              {/* Items */}
              <div className="space-y-2">
                {tile.items
                  .filter((i) => i.status !== 'CANCELLED')
                  .map((item) => (
                    <div key={item.id}>
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-medium text-gray-900 leading-tight">
                          {item.quantity > 1 && (
                            <span className="font-bold">{item.quantity}x </span>
                          )}
                          {item.name}
                        </p>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-gray-600 italic mt-0.5">{item.notes}</p>
                      )}
                      {item.allergens.length > 0 && (
                        <p className="text-xs text-red-600 mt-0.5">
                          Allergens: {item.allergens.join(', ')}
                        </p>
                      )}
                      {STATUS_NEXT[item.status] ? (
                        <button
                          onClick={() => advanceItem(getTileKey(tile), item.id, item.status)}
                          className={`mt-1.5 w-full text-xs py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80 ${itemStatusClass(item.status)}`}
                        >
                          {STATUS_LABEL[item.status]}
                        </button>
                      ) : (
                        <span
                          className={`mt-1.5 block text-center w-full text-xs py-1 rounded-lg font-medium ${itemStatusClass(item.status)}`}
                        >
                          {STATUS_LABEL[item.status]}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
