'use client';

import { useEffect, useRef, useState } from 'react';

import { PageShell, PageHead, PageHeadMetaDot } from '@/components/pitch';

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
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PREPPING',
  PREPPING: 'SERVED',
};

const STATUS_LABEL: Record<OrderItemStatus, string> = {
  PENDING: 'Tap to confirm',
  CONFIRMED: 'Tap to start prep',
  PREPPING: 'Tap when ready',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
  CASH_PENDING: 'Cash payment',
};

function getTileKey(tile: KdsTile): string {
  return `${tile.tableNumber}__${tile.participantName}`;
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

function kdsTileProtoClass(tile: KdsTile): string {
  const statuses = tile.items.map((i) => i.status).filter((s) => s !== 'CANCELLED');
  if (statuses.includes('CASH_PENDING')) return 'cash';
  if (
    statuses.length > 0 &&
    statuses.every((s) => s === 'SERVED') &&
    tile.items.some((i) => i.status === 'SERVED')
  ) {
    return 'done';
  }
  const ms = elapsedMs(tile.openedAt);
  if (ms >= 10 * 60_000 && statuses.some((s) => s === 'PREPPING' || s === 'CONFIRMED' || s === 'PENDING')) {
    return 'late';
  }
  return '';
}

function actClassForStatus(status: OrderItemStatus): string {
  if (status === 'PENDING' || status === 'CONFIRMED') return 'confirm';
  if (status === 'PREPPING') return 'ready';
  if (status === 'SERVED') return 'served';
  if (status === 'CASH_PENDING') return 'cash';
  return '';
}

// Mock tiles — TODO: replace with useRestaurantStream subscription
// IMPORTANT: this component must explicitly ignore SSE events with type='service_request'
const MOCK_TILES: KdsTile[] = [
  {
    tableNumber: '2',
    participantName: 'Michael',
    dietaryNotes: 'nut allergy',
    openedAt: new Date(Date.now() - 4 * 60000).toISOString(),
    items: [
      {
        id: 'o1',
        name: 'Ribeye Steak',
        quantity: 1,
        notes: 'medium rare',
        status: 'PREPPING',
        allergens: ['dairy'],
        updatedAt: new Date(Date.now() - 3 * 60000).toISOString(),
      },
      {
        id: 'o2',
        name: 'Lobster Bisque',
        quantity: 1,
        notes: null,
        status: 'SERVED',
        allergens: ['shellfish', 'dairy'],
        updatedAt: new Date(Date.now() - 2 * 60000).toISOString(),
      },
    ],
  },
  {
    tableNumber: '2',
    participantName: 'Sarah',
    dietaryNotes: null,
    openedAt: new Date(Date.now() - 2 * 60000).toISOString(),
    items: [
      {
        id: 'o3',
        name: 'Cheeseburger',
        quantity: 1,
        notes: 'no pickles',
        status: 'PENDING',
        allergens: ['dairy', 'gluten'],
        updatedAt: new Date(Date.now() - 2 * 60000).toISOString(),
      },
      {
        id: 'o4',
        name: 'Caesar Salad',
        quantity: 1,
        notes: null,
        status: 'PENDING',
        allergens: ['dairy', 'gluten'],
        updatedAt: new Date(Date.now() - 2 * 60000).toISOString(),
      },
    ],
  },
  {
    tableNumber: 'Bar 1',
    participantName: 'Guest',
    dietaryNotes: 'vegan',
    openedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    items: [
      {
        id: 'o5',
        name: 'Caesar Salad',
        quantity: 2,
        notes: 'no cheese, no croutons',
        status: 'CASH_PENDING',
        allergens: [],
        updatedAt: new Date(Date.now() - 11 * 60000).toISOString(),
      },
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
            item.id === itemId ? { ...item, status: next, updatedAt: new Date().toISOString() } : item,
          ),
        };
      }),
    );

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
            .filter((tile) => tile.items.length > 0),
        );
        servedTimers.current.delete(itemId);
      }, 60000);
      servedTimers.current.set(itemId, timer);
    }
  }

  const activeTiles = tiles.filter((tile) => tile.items.some((i) => i.status !== 'CANCELLED'));

  const cashCount = activeTiles.filter((t) => t.items.some((i) => i.status === 'CASH_PENDING')).length;

  return (
    <PageShell>
      <PageHead
        title={
          <>
            Kitchen <em>display</em>
          </>
        }
        subtitle={<>Tap a ticket to advance its state. Cash and late tickets glow.</>}
        meta={
          <>
            <PageHeadMetaDot />
            Live · {activeTiles.length} tickets · {cashCount} cash
          </>
        }
      />

      {activeTiles.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-[14px] border border-dashed border-border bg-card">
          <p className="font-body text-muted-foreground">No active orders</p>
        </div>
      ) : (
        <div className="kds-strip">
          {activeTiles.map((tile) => {
            const mod = kdsTileProtoClass(tile);
            return (
              <div key={getTileKey(tile)} className={`kds-tile ${mod}`.trim()}>
                <div className="h">
                  <div>
                    <div className="table">Table {tile.tableNumber}</div>
                    <div className="who">{tile.participantName}</div>
                  </div>
                  <div className="timer">{elapsedLabel(tile.openedAt)}</div>
                </div>

                {tile.dietaryNotes ? <div className="diet">Dietary: {tile.dietaryNotes}</div> : null}

                <div className="items">
                  {tile.items
                    .filter((i) => i.status !== 'CANCELLED')
                    .map((item) => (
                      <div key={item.id} className="it">
                        <div>
                          <span className="q">×{item.quantity}</span>
                          {item.name}
                        </div>
                        {item.notes ? <span className="n">{item.notes}</span> : null}
                        {item.allergens.length > 0 ? (
                          <span className="al">Allergens: {item.allergens.join(', ')}</span>
                        ) : null}

                        {STATUS_NEXT[item.status] ? (
                          <button
                            type="button"
                            onClick={() => advanceItem(getTileKey(tile), item.id, item.status)}
                            className={`act ${actClassForStatus(item.status)}`}
                          >
                            {STATUS_LABEL[item.status]}
                          </button>
                        ) : (
                          <div className={`act ${actClassForStatus(item.status)}`}>{STATUS_LABEL[item.status]}</div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
