'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { PageShell, PageHead, PageHeadMetaDot } from '@/components/pitch';
import { useRestaurantStream, type RestaurantStreamEvent } from '@/hooks/useRestaurantStream';

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

/** API accepts these transition targets (see OrderStatusUpdateSchema). */
const STATUS_POST_BODY: Partial<Record<OrderItemStatus, 'CONFIRMED' | 'PREPPING' | 'SERVED'>> = {
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

export default function KitchenPage() {
  const { data: session } = useSession();
  const restaurantId = session?.user?.restaurantId ?? '';

  const [tiles, setTiles] = useState<KdsTile[]>([]);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchKitchen = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/restaurant/kitchen', { credentials: 'include' });
      if (!res.ok) {
        setTiles([]);
        return;
      }
      const data = (await res.json()) as { tiles: KdsTile[] };
      setTiles(data.tiles ?? []);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void fetchKitchen();
  }, [fetchKitchen]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Polling backup: order_items are not on the restaurant SSE channel.
  useEffect(() => {
    if (!restaurantId) return;
    const id = setInterval(() => {
      void fetchKitchen();
    }, 5000);
    return () => clearInterval(id);
  }, [restaurantId, fetchKitchen]);

  const onStreamEvent = useCallback((event: RestaurantStreamEvent) => {
    if (event.type === 'session_update' || event.type === 'table_update') {
      void fetchKitchen();
    }
  }, [fetchKitchen]);

  useRestaurantStream({
    restaurantId,
    onEvent: onStreamEvent,
    enabled: Boolean(restaurantId),
  });

  async function advanceItem(tileKey: string, itemId: string, current: OrderItemStatus) {
    const nextStatus = STATUS_NEXT[current];
    const postStatus = nextStatus ? STATUS_POST_BODY[current] : undefined;
    if (!nextStatus || !postStatus) return;

    setTiles((prev) =>
      prev.map((tile) => {
        if (getTileKey(tile) !== tileKey) return tile;
        return {
          ...tile,
          items: tile.items.map((item) =>
            item.id === itemId ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item,
          ),
        };
      }),
    );

    try {
      const res = await fetch(`/api/restaurant/orders/${itemId}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: postStatus }),
      });
      if (!res.ok) {
        await fetchKitchen();
      }
    } catch {
      await fetchKitchen();
    }
  }

  const activeTiles = useMemo(
    () => tiles.filter((tile) => tile.items.some((i) => i.status !== 'CANCELLED')),
    [tiles],
  );

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

      {loading && activeTiles.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-[14px] border border-dashed border-border bg-card">
          <p className="font-body text-muted-foreground">Loading kitchen…</p>
        </div>
      ) : activeTiles.length === 0 ? (
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
