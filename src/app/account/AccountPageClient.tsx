'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadStripe, type StripePaymentElementOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { urlBase64ToUint8Array } from '@/lib/push/urlBase64';

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// `link: 'never'` is supported at runtime on Stripe.js for the Payment Element
// but its TS type was only added in stripe/stripe-js#759 (post-v4.10). Cast so
// we don't need to bump the SDK in this fix.
const paymentElementOptions = {
  wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
} as unknown as StripePaymentElementOptions;

type Me = {
  email: string;
  name: string;
  autoChargeEnabled: boolean;
  defaultTipBehavior: string;
  defaultIdleTimeoutMinutes: number | null;
  defaultDietaryNotes: string | null;
  stripeDefaultPaymentMethodId: string | null;
};

function CardSetupForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    try {
      const { error: err, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });
      if (err) {
        setError(err.message ?? 'Setup failed');
        return;
      }
      const pm = setupIntent?.payment_method;
      const pmId =
        typeof pm === 'string' ? pm : pm && typeof pm === 'object' && 'id' in pm ? (pm as { id: string }).id : null;
      if (!pmId) {
        setError('Could not read payment method');
        return;
      }
      const res = await fetch('/api/diner/payment-method/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId: pmId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === 'string' ? j.error : 'Could not save card');
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement options={paymentElementOptions} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !stripe}
        className="w-full py-2 rounded-lg bg-black text-white text-sm disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save card'}
      </button>
    </form>
  );
}

export default function AccountPageClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const stripePromise = useMemo(() => (pk ? loadStripe(pk) : null), []);

  const load = useCallback(async () => {
    const res = await fetch('/api/diner/me');
    if (!res.ok) return;
    const j = (await res.json()) as Me;
    setMe(j);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startCardSetup() {
    const res = await fetch('/api/diner/payment-method/setup', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || typeof j.clientSecret !== 'string') {
      alert('Could not start card setup');
      return;
    }
    setClientSecret(j.clientSecret);
  }

  async function enablePush() {
    setPushBusy(true);
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid || !('serviceWorker' in navigator)) {
        alert('Push not available in this browser or VAPID key missing.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const key = urlBase64ToUint8Array(vapid);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as BufferSource,
      });
      await fetch('/api/diner/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      alert('Push notifications enabled.');
    } finally {
      setPushBusy(false);
    }
  }

  async function savePrefs(partial: Partial<Me>) {
    await fetch('/api/diner/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    await load();
  }

  if (loading || !me) {
    return <div className="px-4 py-16 text-center text-neutral-400 text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Account</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {me.name} · {me.email}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Payment</h2>
        <p className="text-sm text-neutral-600">
          {me.stripeDefaultPaymentMethodId ? 'Card on file — you can replace it below.' : 'No card on file yet.'}
        </p>
        {!clientSecret && (
          <button
            type="button"
            onClick={() => void startCardSetup()}
            className="text-sm px-4 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50"
          >
            {me.stripeDefaultPaymentMethodId ? 'Replace card' : 'Add card'}
          </button>
        )}
        {clientSecret && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CardSetupForm
              onDone={() => {
                setClientSecret(null);
                void load();
              }}
            />
          </Elements>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Tip preference</h2>
        <select
          value={me.defaultTipBehavior}
          onChange={(e) => void savePrefs({ defaultTipBehavior: e.target.value as Me['defaultTipBehavior'] })}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="ASK">Ask me after each meal</option>
          <option value="AUTO_18">Always 18%</option>
          <option value="AUTO_20">Always 20%</option>
          <option value="AUTO_22">Always 22%</option>
          <option value="AUTO_NONE">No tip by default</option>
        </select>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Dietary notes</h2>
        <textarea
          value={me.defaultDietaryNotes ?? ''}
          onChange={(e) => setMe({ ...me, defaultDietaryNotes: e.target.value })}
          onBlur={() => void savePrefs({ defaultDietaryNotes: me.defaultDietaryNotes })}
          maxLength={100}
          rows={3}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          placeholder="Shared with the kitchen when you open a tab"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Notifications</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={me.autoChargeEnabled}
            onChange={(e) => void savePrefs({ autoChargeEnabled: e.target.checked })}
          />
          Instant checkout when your meal ends (auto-charge when enabled)
        </label>
        <button
          type="button"
          disabled={pushBusy}
          onClick={() => void enablePush()}
          className="text-sm px-4 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
        >
          {pushBusy ? 'Working…' : 'Enable push notifications'}
        </button>
      </section>

      <p>
        <Link href="/account/history" className="text-sm font-medium text-black underline">
          Order history
        </Link>
      </p>
    </div>
  );
}
