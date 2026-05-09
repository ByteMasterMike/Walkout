'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Suspense } from 'react';
import StripePaymentSheet from '@/components/StripePaymentSheet';

type SetupPayload = {
  setupClientSecret: string | null;
  sessionId: string;
  participantId: string;
  stripeConnectAccountId: string;
  cardUpdateToken: string;
};

function RejoinInner() {
  const { participantId } = useParams<{ participantId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<SetupPayload | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !participantId) {
      setError('Invalid link — open the link from your email.');
      setLoading(false);
      return;
    }
    void fetch(`/api/sessions/rejoin-setup?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Link expired or invalid');
        return j as SetupPayload;
      })
      .then((j) => {
        if (!j.setupClientSecret) throw new Error('Could not start card update');
        setPayload(j);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, participantId]);

  async function afterCard(pmId: string, p: SetupPayload) {
    const holdRes = await fetch(`/api/sessions/${p.sessionId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: p.participantId,
        stripePaymentMethodId: pmId,
        cardUpdateToken: p.cardUpdateToken,
      }),
    });
    const holdJson = (await holdRes.json().catch(() => ({}))) as {
      status?: string;
      clientSecret?: string | null;
      error?: string;
    };
    if (!holdRes.ok) {
      throw new Error(holdJson.error ?? 'Could not save card');
    }
    if (holdJson.status === 'requires_action' && holdJson.clientSecret) {
      const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!pk) throw new Error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
      const stripe = await loadStripe(pk, { stripeAccount: p.stripeConnectAccountId });
      if (!stripe) throw new Error('Stripe failed to load');
      const { error: actionError } = await stripe.handleNextAction({
        clientSecret: holdJson.clientSecret,
      });
      if (actionError) throw new Error(actionError.message ?? 'Authentication failed');
    } else if (holdJson.status === 'failed') {
      throw new Error(holdJson.error ?? 'Card declined');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <p className="text-sm text-destructive text-center">{error}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="font-display text-2xl font-light">Card updated</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-sm">
          Your new payment method is saved. You can close this page.
        </p>
      </div>
    );
  }

  if (!payload?.setupClientSecret) return null;

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-light tracking-tight">Update payment method</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a new card for your tab. This link expires in 48 hours.
          </p>
        </div>
        <StripePaymentSheet
          clientSecret={payload.setupClientSecret}
          stripeConnectAccountId={payload.stripeConnectAccountId}
          submitLabel="Save new card"
          onSuccess={async (pmId) => {
            setBusy(true);
            setError('');
            try {
              await afterCard(pmId, payload);
              setSuccess(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Something went wrong');
            } finally {
              setBusy(false);
            }
          }}
        />
        {error && (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {busy && <p className="text-center text-xs text-muted-foreground">Saving…</p>}
      </div>
    </main>
  );
}

export default function RejoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <RejoinInner />
    </Suspense>
  );
}
