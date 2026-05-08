'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Decimal from 'decimal.js';

type SessionPayload = {
  session: {
    id: string;
    status: string;
    restaurantName: string;
    tableNumber: string;
    walkOutServiceFeePercent: string;
    walkOutServiceFeeFlat: number;
    taxRate: string;
    taxEnabled: boolean;
  };
};

type OrderRow = {
  id: string;
  participantId: string;
  menuItemName: string;
  unitPrice: string;
  taxAmount: string;
  quantity: number;
  status: string;
};

export default function TabPayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload['session'] | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [confirmStep, setConfirmStep] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [cashSuccess, setCashSuccess] = useState(false);

  useEffect(() => {
    try {
      const pid = sessionStorage.getItem(`walkout_participant_${sessionId}`);
      setParticipantId(pid);
      if (!pid) {
        setError('No tab identity found. Please scan the table QR again to join.');
        setLoading(false);
      }
    } catch {
      setError('Could not read session storage.');
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!participantId || !sessionId) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          throw new Error('Could not load your tab.');
        }
        const data = (await res.json()) as SessionPayload & {
          orders: OrderRow[];
        };
        if (cancelled) return;
        setSession(data.session);
        const mine = data.orders.filter((o) => o.participantId === participantId);
        setOrders(mine);
      } catch {
        if (!cancelled) setError('Could not load your tab.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, participantId]);

  const activeOrders = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'CASH_PENDING');

  const subtotal = activeOrders.reduce(
    (sum, o) => sum.plus(new Decimal(o.unitPrice).times(o.quantity)),
    new Decimal(0),
  );
  const tax = activeOrders.reduce((sum, o) => sum.plus(new Decimal(o.taxAmount)), new Decimal(0));

  const feePct = session ? new Decimal(session.walkOutServiceFeePercent) : new Decimal(0);
  const flatCents = session?.walkOutServiceFeeFlat ?? 0;
  const serviceFee = session
    ? subtotal.times(feePct).plus(new Decimal(flatCents).dividedBy(100)).toDecimalPlaces(2)
    : new Decimal(0);

  const totalBeforeTip = subtotal.plus(tax).plus(serviceFee);

  const hasUnserved = activeOrders.some((o) =>
    ['PENDING', 'CONFIRMED', 'PREPPING'].includes(o.status),
  );

  async function payWithCash() {
    if (!participantId || !sessionId) return;
    setCashLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Could not switch to cash.');
        return;
      }
      setCashSuccess(true);
    } finally {
      setCashLoading(false);
    }
  }

  async function runCheckout() {
    if (!participantId || !sessionId) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Checkout failed.');
        return;
      }
      setDone(true);
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading checkout…</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
        <p className="text-sm text-gray-700 text-center mb-4">{error}</p>
        <Link href="/" className="text-sm font-medium text-gray-900 underline">
          Go home
        </Link>
      </div>
    );
  }

  if (cashSuccess && session) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-2xl p-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Cash payment</h1>
          <p className="text-sm text-gray-600 mb-6">
            Your server will collect payment at the table. A receipt may print at the expediter station —
            no further action is needed in the app.
          </p>
          <Link href="/" className="block w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 text-center">
            Done
          </Link>
        </div>
      </div>
    );
  }

  if (done && session) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;re all set</h1>
          <p className="text-sm text-gray-600 mb-2">
            We&apos;ll charge your card for{' '}
            <span className="font-semibold text-gray-900">${totalBeforeTip.toFixed(2)}</span> plus tip when you choose
            an amount (or after the tip window ends).
          </p>
          <p className="text-xs text-gray-400 mb-6">
            You may receive a text with a link to add your tip. Thank you for dining with {session.restaurantName}.
          </p>
          <Link href="/" className="block w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 text-center">
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs text-gray-500 hover:text-gray-900 mb-1"
          >
            ← Back
          </button>
          <h1 className="text-lg font-bold text-gray-900">Ready to leave</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Table {session?.tableNumber} · {session?.restaurantName}
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {hasUnserved && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
            Some items may still be in the kitchen. You can leave — your server will catch up.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
          {activeOrders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No items on your tab.</p>
          ) : (
            activeOrders.map((o) => (
              <div key={o.id} className="flex justify-between px-4 py-3 text-sm">
                <span className="text-gray-900">
                  {o.quantity > 1 ? `${o.quantity}× ` : ''}
                  {o.menuItemName}
                </span>
                <span className="text-gray-600 shrink-0 ml-2">
                  ${new Decimal(o.unitPrice).times(o.quantity).toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>
              Tax
              {session?.taxEnabled ? ` (${new Decimal(session.taxRate).times(100).toFixed(2)}%)` : ''}
            </span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Service fee</span>
            <span>${serviceFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total (before tip)</span>
            <span>${totalBeforeTip.toFixed(2)}</span>
          </div>
        </div>

        {!confirmStep ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setConfirmStep(true)}
              className="w-full py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
            >
              Ready to leave
            </button>
            <button
              type="button"
              disabled={cashLoading}
              onClick={() => void payWithCash()}
              className="w-full py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              {cashLoading ? 'Switching…' : 'Pay with cash'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-center text-gray-500">
              This lets the restaurant close out your meal and send your tip prompt.
            </p>
            <button
              type="button"
              disabled={checkoutLoading}
              onClick={() => void runCheckout()}
              className="w-full py-3.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {checkoutLoading ? 'Processing…' : 'Confirm departure'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmStep(false)}
              className="w-full py-2 text-xs text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
