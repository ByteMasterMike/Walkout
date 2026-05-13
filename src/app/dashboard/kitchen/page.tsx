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
  PENDING:   'CONFIRMED',
  CONFIRMED: 'PREPPING',
  PREPPING:  'SERVED',
};

const STATUS_LABEL: Record<OrderItemStatus, string> = {
  PENDING:      'Tap to confirm',
  CONFIRMED:    'Tap to start prep',
  PREPPING:     'Tap when ready',
  SERVED:       'Served',
  CANCELLED:    'Cancelled',
  CASH_PENDING: 'Cash payment',
};

function getTileKey(tile: KdsTile): string {
  return `${tile.tableNumber}__${tile.participantName}`;
}

function tileColorClass(tile: KdsTile): string {
  const statuses = tile.items.map((i) => i.status);
  if (statuses.includes('CASH_PENDING')) return 'border-destructive/50 bg-destructive/10';
  if (statuses.every((s) => s === 'SERVED' || s === 'CANCELLED')) return 'border-moss/40 bg-moss/10 opacity-60';
  if (statuses.some((s) => s === 'PREPPING')) return 'border-amber-soft-line bg-amber-soft';
  return 'border-border bg-card';
}

function itemStatusClass(status: OrderItemStatus): string {
  const map: Record<OrderItemStatus, string> = {
    PENDING:      'border border-border bg-scrim-3 text-foreground',
    CONFIRMED:    'border border-amber-soft-line bg-amber-soft text-primary',
    PREPPING:     'border border-primary/40 bg-amber-soft text-primary',
    SERVED:       'border border-moss/50 bg-moss/15 text-moss',
    CANCELLED:    'border border-border bg-muted text-muted-foreground',
    CASH_PENDING: 'border border-destructive/45 bg-destructive/15 text-destructive',
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
  if (mins >= 10) return 'text-destructive font-bold';
  if (mins >= 5)  return 'text-primary font-semibold';
  return 'text-muted-foreground';
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
    <div className="min-h-screen p-4 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-border pb-6">
        <h1 className="font-display text-3xl font-light tracking-[-0.03em] text-foreground md:text-4xl">
          Kitchen Display
        </h1>
        <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />
          <span>Live</span>
        </div>
      </div>

      {activeTiles.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-[14px] border border-dashed border-border bg-card">
          <p className="font-body text-muted-foreground">No active orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {activeTiles.map((tile) => (
            <div
              key={getTileKey(tile)}
              className={`flex min-h-[240px] flex-col gap-2.5 rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 ${tileColorClass(tile)}`}
            >
              {/* Tile header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-2xl font-light tracking-[-0.02em] text-foreground">
                    Table {tile.tableNumber}
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                    {tile.participantName}
                  </p>
                </div>
                <span className={`font-mono text-sm tabular-nums ${elapsedColorClass(tile.openedAt)}`}>
                  {elapsedLabel(tile.openedAt)}
                </span>
              </div>

              {/* Dietary notes */}
              {tile.dietaryNotes && (
                <p className="border-b border-border pb-2 font-body text-sm font-medium text-destructive">
                  Dietary: {tile.dietaryNotes}
                </p>
              )}

              {/* Items */}
              <div className="flex flex-1 flex-col gap-2">
                {tile.items
                  .filter((i) => i.status !== 'CANCELLED')
                  .map((item) => (
                    <div key={item.id}>
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[15px] font-medium leading-tight text-foreground">
                          {item.quantity > 1 && (
                            <span className="font-mono text-[11px] text-primary">{item.quantity}x </span>
                          )}
                          {item.name}
                        </p>
                      </div>
                      {item.notes && (
                        <p className="mt-0.5 font-body text-[13px] italic text-muted-foreground">{item.notes}</p>
                      )}
                      {item.allergens.length > 0 && (
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-destructive">
                          Allergens: {item.allergens.join(', ')}
                        </p>
                      )}
                      {STATUS_NEXT[item.status] ? (
                        <button
                          type="button"
                          onClick={() => advanceItem(getTileKey(tile), item.id, item.status)}
                          className={`mt-2 w-full rounded-lg py-2 text-center font-mono text-[9px] font-medium uppercase tracking-[0.22em] transition-opacity hover:opacity-90 ${itemStatusClass(item.status)}`}
                        >
                          {STATUS_LABEL[item.status]}
                        </button>
                      ) : (
                        <span
                          className={`mt-2 block w-full rounded-lg py-2 text-center font-mono text-[9px] font-medium uppercase tracking-[0.22em] ${itemStatusClass(item.status)}`}
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
