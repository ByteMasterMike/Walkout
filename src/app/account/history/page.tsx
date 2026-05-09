'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Row = {
  id: string;
  joinedAt: string;
  capturedAt: string | null;
  capturedAmountCents: number | null;
  resolvedTipAmountCents: number | null;
  restaurantName: string;
  tableNumber: string;
  orders: { name: string; quantity: number; status: string }[];
};

export default function AccountHistoryPage() {
  const [sessions, setSessions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/diner/history');
    if (!res.ok) return;
    const j = (await res.json()) as { sessions: Row[] };
    setSessions(j.sessions);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="px-4 py-16 text-center text-neutral-400 text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
      <Link href="/account" className="text-xs text-neutral-400 hover:text-neutral-600">
        Back to account
      </Link>
      <h1 className="text-2xl font-bold text-neutral-900">Order history</h1>
      <ul className="space-y-4">
        {sessions.map((s) => (
          <li key={s.id} className="border border-neutral-200 rounded-xl p-4 bg-white">
            <p className="font-medium text-neutral-900">{s.restaurantName}</p>
            <p className="text-xs text-neutral-500">
              Table {s.tableNumber} · {new Date(s.joinedAt).toLocaleString()}
            </p>
            {s.capturedAmountCents != null && (
              <p className="text-sm mt-2">
                Total charged: ${(s.capturedAmountCents / 100).toFixed(2)}
                {s.resolvedTipAmountCents != null && s.resolvedTipAmountCents > 0 && (
                  <span className="text-neutral-500"> (incl. tip)</span>
                )}
              </p>
            )}
            <ul className="mt-2 text-sm text-neutral-600 space-y-1">
              {s.orders.map((o, i) => (
                <li key={i}>
                  {o.quantity}× {o.name}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {sessions.length === 0 && <p className="text-sm text-neutral-400 text-center py-8">No completed tabs yet.</p>}
    </div>
  );
}
