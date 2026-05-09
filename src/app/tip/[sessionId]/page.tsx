'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Decimal from 'decimal.js';
import { Button } from '@/components/ui/button';

function centsToUsd(c: number) {
  return new Decimal(c).div(100).toFixed(2);
}

type TipTokenResponse = {
  token: string;
  participantId: string;
  subtotalCents: number;
  taxCents: number;
  serviceFeeCents: number;
  maxTipCents: number;
  serviceFeePercent: string;
};

type TipChoice = 'none' | 'custom' | 'p18' | 'p20' | 'p22' | null;

function TipPageInner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [data, setData] = useState<TipTokenResponse | null>(null);
  const [choice, setChoice] = useState<TipChoice>(null);
  const [customDollars, setCustomDollars] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const q = urlToken ? `?token=${encodeURIComponent(urlToken)}` : '';
    setLoading(true);
    setErr('');
    void fetch(`/api/sessions/${sessionId}/tip-token${q}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not load your tab');
        return j as TipTokenResponse;
      })
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [sessionId, urlToken]);

  const presetCents = useMemo(() => {
    if (!data) return { p18: 0, p20: 0, p22: 0 };
    const s = data.subtotalCents;
    return {
      p18: Math.round((s * 18) / 100),
      p20: Math.round((s * 20) / 100),
      p22: Math.round((s * 22) / 100),
    };
  }, [data]);

  function resolvedTipCents(): number | null {
    if (!data) return null;
    if (choice === 'none') return 0;
    if (choice === 'p18') return presetCents.p18;
    if (choice === 'p20') return presetCents.p20;
    if (choice === 'p22') return presetCents.p22;
    if (choice === 'custom') {
      const raw = customDollars.replace(/^\$/, '').trim();
      if (!raw) return null;
      try {
        const d = new Decimal(raw);
        if (d.isNaN() || !d.isFinite() || d.isNegative()) return null;
        return d.times(100).toDecimalPlaces(0).toNumber();
      } catch {
        return null;
      }
    }
    return null;
  }

  async function handlePay() {
    if (!data) return;
    const cents = resolvedTipCents();
    if (cents === null) {
      setErr('Choose a tip amount or select “No tip”.');
      return;
    }
    if (cents > data.maxTipCents) {
      setErr(`Tip cannot exceed $${centsToUsd(data.maxTipCents)} for this tab.`);
      return;
    }

    const tipSource = cents === 0 ? 'DINER_DECLINED' : 'DINER_CHOICE';
    setSubmitting(true);
    setErr('');
    try {
      const r = await fetch(`/api/sessions/${sessionId}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: data.participantId,
          tipToken: data.token,
          tipCents: cents,
          tipSource,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : 'Payment failed');
      }
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <p className="text-sm text-destructive text-center">{err}</p>
      </div>
    );
  }

  if (!data) return null;

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="font-display text-2xl font-light">You&apos;re all set</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-sm">
          Thanks — your card will be charged and a receipt will be on its way.
        </p>
      </div>
    );
  }

  const feePctLabel = new Decimal(data.serviceFeePercent).times(100).toFixed(2).replace(/\.?0+$/, '');

  return (
    <div className="min-h-screen bg-background px-4 py-10 pb-24">
      <h1 className="font-display text-2xl font-light tracking-tight text-center">Tip &amp; pay</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">Review your bill, then confirm.</p>

      <div className="mt-8 max-w-md mx-auto rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${centsToUsd(data.subtotalCents)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tax</span>
          <span>${centsToUsd(data.taxCents)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">WalkOut fee ({feePctLabel}%)</span>
          <span>${centsToUsd(data.serviceFeeCents)}</span>
        </div>
        <div className="border-t border-border pt-3 flex justify-between text-sm font-medium">
          <span>Before tip</span>
          <span>${centsToUsd(data.subtotalCents + data.taxCents + data.serviceFeeCents)}</span>
        </div>
      </div>

      <div className="mt-8 max-w-md mx-auto">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Tip</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['p18', '18%', presetCents.p18],
              ['p20', '20%', presetCents.p20],
              ['p22', '22%', presetCents.p22],
            ] as const
          ).map(([key, label, cents]) => (
            <Button
              key={key}
              type="button"
              variant={choice === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setChoice(key);
                setCustomDollars('');
              }}
            >
              {label}
              <span className="block text-xs opacity-80">${centsToUsd(cents)}</span>
            </Button>
          ))}
        </div>
        <Button
          type="button"
          className="w-full mt-3"
          variant={choice === 'custom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChoice('custom')}
        >
          Custom amount
        </Button>
        {choice === 'custom' && (
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={customDollars}
            onChange={(e) => setCustomDollars(e.target.value)}
            className="mt-2 w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
        )}
        <Button
          type="button"
          className="w-full mt-3"
          variant={choice === 'none' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setChoice('none');
            setCustomDollars('');
          }}
        >
          No tip
        </Button>
      </div>

      {err && (
        <p className="mt-6 text-center text-sm text-destructive max-w-md mx-auto" role="alert">
          {err}
        </p>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 border-t border-border bg-background/95 backdrop-blur">
        <div className="max-w-md mx-auto">
          <Button className="w-full" size="lg" disabled={submitting} onClick={() => void handlePay()}>
            {submitting ? 'Processing…' : 'Confirm & pay'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TipPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <TipPageInner />
    </Suspense>
  );
}
