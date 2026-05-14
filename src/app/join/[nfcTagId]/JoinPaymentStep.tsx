'use client';

import { FormEvent, useCallback, useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import type { StripePaymentElementOptions } from '@stripe/stripe-js';

// `link: 'never'` is supported at runtime on Stripe.js for the Payment Element
// but its TS type was only added in stripe/stripe-js#759 (post-v4.10). Cast so
// we don't need to bump the SDK in this fix.
const paymentElementOptions = {
  wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
} as unknown as StripePaymentElementOptions;

function paymentMethodIdFromSetupIntent(pm: unknown): string | null {
  if (typeof pm === 'string') return pm;
  if (pm && typeof pm === 'object' && 'id' in pm && typeof (pm as { id: unknown }).id === 'string') {
    return (pm as { id: string }).id;
  }
  return null;
}

type Props = {
  sessionId: string;
  participantId: string;
  /** Needed to recover the saved PM when confirmSetup errors with setup_intent_unexpected_state (already succeeded). */
  setupClientSecret: string;
  onDone: () => void;
};

/** Stripe.js errors often include `code` / `decline_code` beyond the generic `message`. */
function formatStripeError(err: {
  message?: string | null;
  code?: string;
  decline_code?: string;
}): string {
  const msg = err.message?.trim() || 'Something went wrong.';
  const extra = [err.code, err.decline_code].filter(Boolean).join(' · ');
  return extra ? `${msg} (${extra})` : msg;
}

export default function JoinPaymentStep({ sessionId, participantId, setupClientSecret, onDone }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** After confirmSetup succeeds, the SetupIntent is terminal — retries must only re-call /hold. */
  const [confirmedPaymentMethodId, setConfirmedPaymentMethodId] = useState<string | null>(null);

  const placeHold = useCallback(
    async (stripePaymentMethodId: string) => {
      if (!stripe) return;

      const res = await fetch(`/api/sessions/${sessionId}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, stripePaymentMethodId }),
      });

      const parsed = (await res.json().catch(() => ({}))) as {
        status?: string;
        clientSecret?: string;
        error?: string;
      };

      if (parsed.status === 'requires_action' && parsed.clientSecret) {
        const { error: piErr } = await stripe.confirmCardPayment(parsed.clientSecret);
        if (piErr) {
          setError(formatStripeError(piErr));
          if (process.env.NODE_ENV === 'development') {
            console.warn('[join-payment] confirmCardPayment', piErr);
          }
          return;
        }
        onDone();
        return;
      }

      if (!res.ok || parsed.status === 'failed') {
        setError(
          typeof parsed.error === 'string'
            ? parsed.error
            : 'Could not place card hold. Please try again.',
        );
        return;
      }

      onDone();
    },
    [onDone, participantId, sessionId, stripe],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stripe) return;

    setBusy(true);
    try {
      let pmId = confirmedPaymentMethodId;

      if (!pmId) {
        if (!elements) return;

        const { error: submitError } = await elements.submit();
        if (submitError) {
          setError(formatStripeError(submitError));
          if (process.env.NODE_ENV === 'development') {
            console.warn('[join-payment] elements.submit', submitError);
          }
          return;
        }

        const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
          elements,
          redirect: 'if_required',
        });

        if (!confirmErr) {
          pmId = paymentMethodIdFromSetupIntent(setupIntent?.payment_method);
        } else if (confirmErr.code === 'setup_intent_unexpected_state') {
          // Usually means SetupIntent already succeeded (e.g. first click worked but /hold failed).
          const retrieved = await stripe.retrieveSetupIntent(setupClientSecret);
          if (retrieved.error) {
            setError(formatStripeError(retrieved.error));
            if (process.env.NODE_ENV === 'development') {
              console.warn('[join-payment] retrieveSetupIntent', retrieved.error);
            }
            return;
          }
          if (retrieved.setupIntent?.status === 'succeeded') {
            pmId = paymentMethodIdFromSetupIntent(retrieved.setupIntent.payment_method);
          }
        }

        if (!pmId) {
          if (confirmErr) {
            setError(formatStripeError(confirmErr));
            if (process.env.NODE_ENV === 'development') {
              console.warn('[join-payment] confirmSetup', confirmErr);
            }
          } else {
            setError('Could not read payment method. Please try again.');
          }
          return;
        }

        setConfirmedPaymentMethodId(pmId);
      }

      await placeHold(pmId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={paymentElementOptions} />
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={busy || !stripe}
        className="w-full bg-black text-white rounded-lg py-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Saving card…' : 'Save card & place hold'}
      </button>
      <p className="text-xs text-gray-400">
        A temporary authorization up to $75 may appear on your card. You are only charged for what you order plus tax
        and the service fee.
      </p>
    </form>
  );
}
