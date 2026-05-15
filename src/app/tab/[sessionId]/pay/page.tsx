'use client';

import { useCallback, useEffect, useState } from 'react';
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

type TipPromptPayload = {
  tipToken: string;
  maxTipCents: number;
  subtotalCents: number;
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

type SessionApiResponse = SessionPayload & {
  orders: OrderRow[];
  tipPrompt?: TipPromptPayload | null;
};

function sessionNeedsTipChoice(status: string, prompt: TipPromptPayload | null): boolean {
  return Boolean(prompt && ['AWAITING_TIP', 'CAPTURING', 'OPEN'].includes(status));
}

/** Parses user-entered dollars into integer cents, or null if invalid / empty. */
function parseTipDollarsToCents(raw: string): number | null {
  const trimmed = raw.replace(/[$,\s]/g, '').trim();
  if (trimmed === '') return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function TabPayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload['session'] | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tipPrompt, setTipPrompt] = useState<TipPromptPayload | null>(null);
  const [awaitingTipChoice, setAwaitingTipChoice] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const [tipSubmitLoading, setTipSubmitLoading] = useState(false);
  const [customTipOpen, setCustomTipOpen] = useState(false);
  const [customTipDraft, setCustomTipDraft] = useState('');
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

  const applySessionPayload = useCallback((data: SessionApiResponse, pid: string) => {
    setSession(data.session);
    const mine = data.orders.filter((o) => o.participantId === pid);
    setOrders(mine);
    const prompt = data.tipPrompt ?? null;
    setTipPrompt(prompt);
    setAwaitingTipChoice(sessionNeedsTipChoice(data.session.status, prompt));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const pid = participantId;
      const sid = sessionId;
      if (!pid || !sid) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sid}`);
        if (!res.ok) {
          throw new Error('Could not load your tab.');
        }
        const data = (await res.json()) as SessionApiResponse;
        if (cancelled) return;
        applySessionPayload(data, pid);
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
  }, [sessionId, participantId, applySessionPayload]);

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
    const pid = participantId;
    const sid = sessionId;
    if (!pid || !sid) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sid}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: pid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Checkout failed.');
        return;
      }
      const refresh = await fetch(`/api/sessions/${sid}`);
      if (!refresh.ok) {
        setDone(true);
        return;
      }
      const data = (await refresh.json()) as SessionApiResponse;
      applySessionPayload(data, pid);
      if (!data.tipPrompt) {
        setDone(true);
      }
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function submitTip(tipCents: number, tipSource: 'DINER_CHOICE' | 'DINER_DECLINED') {
    if (!participantId || !sessionId || !tipPrompt) return;
    const capped = Math.min(Math.max(0, tipCents), tipPrompt.maxTipCents);
    setTipSubmitLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          tipToken: tipPrompt.tipToken,
          tipCents: tipSource === 'DINER_DECLINED' ? 0 : capped,
          tipSource,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Could not finalize payment.');
        return;
      }
      setAwaitingTipChoice(false);
      setDone(true);
    } finally {
      setTipSubmitLoading(false);
    }
  }

  function tipFromPercent(pct: number): number {
    if (!tipPrompt) return 0;
    return Math.min(Math.round((tipPrompt.subtotalCents * pct) / 100), tipPrompt.maxTipCents);
  }

  function submitCustomTip() {
    if (!tipPrompt) return;
    const cents = parseTipDollarsToCents(customTipDraft);
    if (cents === null) {
      setError('Enter a valid tip amount.');
      return;
    }
    if (cents > tipPrompt.maxTipCents) {
      setError(`Tip can't exceed $${(tipPrompt.maxTipCents / 100).toFixed(2)} on this tab.`);
      return;
    }
    void submitTip(cents, 'DINER_CHOICE');
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
          <p className="text-sm text-gray-600 mb-6">
            Your payment has been submitted for{' '}
            <span className="font-semibold text-gray-900">${totalBeforeTip.toFixed(2)}</span> plus any tip you chose.
            Your bank may show the charge shortly. Thanks for dining with {session.restaurantName}.
          </p>
          <Link href="/" className="block w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 text-center">
            Done
          </Link>
        </div>
      </div>
    );
  }

  if (awaitingTipChoice && session && tipPrompt && participantId) {
    const maxTip = tipPrompt.maxTipCents / 100;
    return (
      <div className="min-h-screen bg-gray-50 pb-28">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-lg mx-auto">
            <h1 className="text-lg font-bold text-gray-900">Add a tip</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Table {session.tableNumber} · {session.restaurantName}
            </p>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4 space-y-2 text-sm">
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-b border-gray-100 pb-3 mb-2">
              <span>Food &amp; fees (before tip)</span>
              <span>${totalBeforeTip.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-500">
              Tips are capped at 50% of your food subtotal (up to ${maxTip.toFixed(2)} on this tab).
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[15, 18, 20].map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={tipSubmitLoading}
                onClick={() => {
                  setCustomTipOpen(false);
                  void submitTip(tipFromPercent(pct), 'DINER_CHOICE');
                }}
                className="py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
              >
                {pct}%
              </button>
            ))}
          </div>

          {!customTipOpen ? (
            <button
              type="button"
              disabled={tipSubmitLoading}
              onClick={() => {
                setError(null);
                setCustomTipOpen(true);
              }}
              className="w-full py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              Custom amount
            </button>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 space-y-3">
              <label htmlFor="custom-tip-input" className="block text-xs font-medium text-gray-700">
                Custom tip (USD)
              </label>
              <input
                id="custom-tip-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                disabled={tipSubmitLoading}
                value={customTipDraft}
                onChange={(e) => setCustomTipDraft(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500">
                Maximum <span className="font-medium text-gray-700">${maxTip.toFixed(2)}</span> (50% of food subtotal).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={tipSubmitLoading}
                  onClick={() => void submitCustomTip()}
                  className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  Add tip
                </button>
                <button
                  type="button"
                  disabled={tipSubmitLoading}
                  onClick={() => {
                    setCustomTipDraft('');
                    setCustomTipOpen(false);
                    setError(null);
                  }}
                  className="px-4 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={tipSubmitLoading}
            onClick={() => void submitTip(0, 'DINER_DECLINED')}
            className="w-full py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            No tip
          </button>

          <p className="text-xs text-center text-gray-400">
            Having trouble? You can close this screen — if configured, you may still get a text link, or charges finalize
            automatically after the tip window.
          </p>
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
        {session && ['AWAITING_TIP', 'CAPTURING'].includes(session.status) && !tipPrompt && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
            In-app tipping isn&apos;t available (
            <span className="font-medium">TIP_SECRET</span> missing or tip token failed). On production, payment usually still
            finalizes after the tip-window cron (~15 minutes).
          </div>
        )}

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
              This lets the restaurant close out your meal and finalize payment on your card on file.
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
