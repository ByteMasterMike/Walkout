'use client';

import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeElementsOptions, StripePaymentElementOptions } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';

// `link: 'never'` is supported at runtime on Stripe.js for the Payment Element
// but its TS type was only added in stripe/stripe-js#759 (post-v4.10). Cast so
// we don't need to bump the SDK in this fix.
const paymentElementOptions = {
  wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
} as unknown as StripePaymentElementOptions;

type InnerProps = {
  onSuccess: (paymentMethodId: string) => void | Promise<void>;
  submitLabel?: string;
};

function InnerPaymentForm({ onSuccess, submitLabel = 'Save card' }: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setMessage(null);
    setBusy(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setMessage(submitError.message ?? 'Check your payment details');
        return;
      }

      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        setMessage(error.message ?? 'Payment failed');
        return;
      }

      const pm = setupIntent?.payment_method;
      const pmId = typeof pm === 'string' ? pm : pm?.id;
      if (!pmId) {
        setMessage('Could not read payment method');
        return;
      }

      await onSuccess(pmId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={paymentElementOptions} />
      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={!stripe || busy}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}

export type StripePaymentSheetProps = {
  clientSecret: string;
  stripeConnectAccountId: string;
  onSuccess: (paymentMethodId: string) => void | Promise<void>;
  submitLabel?: string;
};

/**
 * Embedded Stripe Payment Element for SetupIntent (card + wallets when enabled on the account).
 * Caller must scope `loadStripe` with the connected account id.
 */
export default function StripePaymentSheet({
  clientSecret,
  stripeConnectAccountId,
  onSuccess,
  submitLabel,
}: StripePaymentSheetProps) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey, { stripeAccount: stripeConnectAccountId });
  }, [stripeConnectAccountId, publishableKey]);

  const options: StripeElementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: { theme: 'stripe' },
    }),
    [clientSecret],
  );

  if (!publishableKey) {
    return (
      <p className="text-sm text-destructive">
        Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — add it to your environment.
      </p>
    );
  }

  if (!stripePromise) {
    return null;
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <InnerPaymentForm onSuccess={onSuccess} submitLabel={submitLabel} />
    </Elements>
  );
}
