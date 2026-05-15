'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import JoinPaymentStep from './JoinPaymentStep';

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export default function JoinPage() {
  const { nfcTagId } = useParams<{ nfcTagId: string }>();
  const router = useRouter();

  const [step, setStep] = useState<'form' | 'payment'>('form');
  const [displayName, setDisplayName] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [stripeConnectAccountId, setStripeConnectAccountId] = useState<string | null>(null);

  // Stripe.js must be initialised with the same `stripeAccount` the SetupIntent
  // was created on, otherwise the PaymentElement silently fails to mount.
  // We can't build this eagerly because we only learn the connected account
  // id from the join response.
  const stripePromise = useMemo(() => {
    if (!pk || !stripeConnectAccountId) return null;
    return loadStripe(pk, { stripeAccount: stripeConnectAccountId });
  }, [stripeConnectAccountId]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch(`/api/join/${nfcTagId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, dietaryNotes: dietaryNotes || undefined, smsSmsOptIn: smsOptIn }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    const data = (await res.json()) as {
      sessionId: string;
      participantId: string;
      setupClientSecret: string | null;
      stripeConnectAccountId: string | null;
      nextStep?: string;
    };

    try {
      sessionStorage.setItem(`walkout_participant_${data.sessionId}`, data.participantId);
    } catch {
      // sessionStorage may be unavailable — tab page will prompt re-join
    }

    setSessionId(data.sessionId);
    setParticipantId(data.participantId);

    const needsPayment = Boolean(data.setupClientSecret && data.nextStep === 'payment');

    if (needsPayment && data.setupClientSecret && data.stripeConnectAccountId) {
      setSetupClientSecret(data.setupClientSecret);
      setStripeConnectAccountId(data.stripeConnectAccountId);
      setStep('payment');
      setLoading(false);
      return;
    }

    // No setupClientSecret means the restaurant's Stripe account is not finished.
    // Do NOT silently route to /tab — the diner would land in the menu with no
    // card on file and no auth hold, which breaks the WalkOut model. Show a
    // clear error and let staff fix Stripe before continuing.
    if (pk) {
      setError(
        "This table can't take a card right now. Please ask your server — payments are still being set up.",
      );
      setLoading(false);
      return;
    }

    // Local/dev fallback only: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing.
    router.push(`/tab/${data.sessionId}`);
    setLoading(false);
  }

  function goToTab() {
    if (sessionId) {
      router.push(`/tab/${sessionId}`);
    }
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Welcome</h1>
          {step === 'form' ? (
            <p className="mt-1 text-sm text-gray-500">
              Enter your name to open a tab. A{' '}
              <span className="font-medium">$75 hold</span> will appear on your card — you only pay for what you order.
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              Add a card on file for your tab. A <span className="font-medium">temporary hold</span> may show on your
              statement until you close out — you only pay for what you order.
            </p>
          )}
        </div>

        {step === 'form' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                Your name
              </label>
              <input
                id="displayName"
                type="text"
                required
                maxLength={60}
                placeholder="e.g. Alex"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label htmlFor="dietaryNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Dietary notes <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="dietaryNotes"
                type="text"
                maxLength={200}
                placeholder="e.g. nut allergy, vegan"
                value={dietaryNotes}
                onChange={(e) => setDietaryNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="w-full bg-black text-white rounded-lg py-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Opening tab...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'payment' && setupClientSecret && sessionId && participantId && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 text-center">Add a payment method</h2>
            {!pk ? (
              <>
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Stripe is not configured (missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). You can continue to your tab
                  — ordering may be limited until a card is on file.
                </p>
                <button
                  type="button"
                  onClick={goToTab}
                  className="w-full border border-gray-300 rounded-lg py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Continue without card
                </button>
              </>
            ) : !stripePromise || !stripeConnectAccountId ? (
              <p className="text-sm text-gray-500 text-center py-4">Loading payment form…</p>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret: setupClientSecret }}>
                <JoinPaymentStep
                  sessionId={sessionId}
                  participantId={participantId}
                  setupClientSecret={setupClientSecret}
                  onDone={goToTab}
                />
              </Elements>
            )}
          </div>
        )}

        {/* Consent & disclaimers */}
        <div className="mt-6 space-y-3 text-xs text-gray-400">
          <p>
            By continuing you agree that a temporary authorization hold of up to $75 will be placed on your payment
            method. You will only be charged for the items you order plus applicable tax and a 0.5% service fee.
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              I agree to receive transactional SMS messages (receipt, departure reminder). Message frequency varies.
              Reply STOP to opt out. Message &amp; data rates may apply.
            </span>
          </label>
        </div>
      </div>
    </main>
  );
}
