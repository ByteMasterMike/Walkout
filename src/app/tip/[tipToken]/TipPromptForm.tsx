'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type Props = {
  sessionId: string;
  participantId: string;
  tipToken: string;
  restaurantName: string;
  taxLabel: string;
  subtotalCents: number;
  taxCents: number;
  serviceFeeCents: number;
  mealTotalCents: number;
  maxTipCents: number;
  presetTipCents: { p18: number; p20: number; p22: number };
  deadlineMs: number;
};

export default function TipPromptForm({
  sessionId,
  participantId,
  tipToken,
  restaurantName,
  taxLabel,
  subtotalCents,
  taxCents,
  serviceFeeCents,
  mealTotalCents,
  maxTipCents,
  presetTipCents,
  deadlineMs,
}: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState<'18' | '20' | '22' | 'custom' | 'none'>('20');
  const [customCents, setCustomCents] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [remainingMs, setRemainingMs] = useState(deadlineMs - Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      setRemainingMs(deadlineMs - Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [deadlineMs]);

  const remainingLabel = useMemo(() => {
    const s = Math.max(0, Math.floor(remainingMs / 1000));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, [remainingMs]);

  function resolvedTipCents(): number {
    if (choice === 'none') return 0;
    if (choice === '18') return presetTipCents.p18;
    if (choice === '20') return presetTipCents.p20;
    if (choice === '22') return presetTipCents.p22;
    const dollars = parseFloat(customCents);
    if (Number.isNaN(dollars) || dollars < 0) return 0;
    return Math.round(dollars * 100);
  }

  async function submit() {
    const tipCents = resolvedTipCents();
    if (tipCents > maxTipCents) {
      setError('Tip exceeds allowed maximum');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/sessions/${sessionId}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          participantId,
          tipToken,
          tipCents,
          tipSource: tipCents === 0 ? 'DINER_DECLINED' : 'DINER_CHOICE',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not complete payment');
        return;
      }
      router.push(`/tab/${sessionId}?paid=1`);
    } finally {
      setSubmitting(false);
    }
  }

  const tipCents = resolvedTipCents();
  const grandTotal = mealTotalCents + tipCents;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-neutral-50 border border-neutral-100 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-600">Subtotal</span>
          <span>{formatMoney(subtotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-600">{taxLabel}</span>
          <span>{formatMoney(taxCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-600">WalkOut service fee</span>
          <span>{formatMoney(serviceFeeCents)}</span>
        </div>
        <div className="flex justify-between font-medium pt-2 border-t border-neutral-200">
          <span>Your meal</span>
          <span>{formatMoney(mealTotalCents)}</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Add a tip</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['18', '18%', presetTipCents.p18],
              ['20', '20% (default)', presetTipCents.p20],
              ['22', '22%', presetTipCents.p22],
            ] as const
          ).map(([key, label, cents]) => (
            <button
              key={key}
              type="button"
              onClick={() => setChoice(key)}
              className={`rounded-lg border px-3 py-2 text-sm text-left ${
                choice === key ? 'border-black bg-black text-white' : 'border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              {label}
              <span className="block text-xs opacity-80">{formatMoney(cents)}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setChoice('custom')}
          className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm text-left ${
            choice === 'custom' ? 'border-black bg-black text-white' : 'border-neutral-200 hover:bg-neutral-50'
          }`}
        >
          Custom amount
        </button>
        {choice === 'custom' && (
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={customCents}
            onChange={(e) => setCustomCents(e.target.value)}
            className="mt-2 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          />
        )}
        <button
          type="button"
          onClick={() => setChoice('none')}
          className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${
            choice === 'none' ? 'border-black bg-black text-white' : 'border-neutral-200 hover:bg-neutral-50'
          }`}
        >
          No tip
        </button>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium tabular-nums">⏱ {remainingLabel} remaining</p>
        <p className="mt-1 text-amber-900/90">
          A 20% tip will be applied if you don&apos;t choose ({restaurantName} checkout policy).
        </p>
      </div>

      <div className="flex justify-between text-base font-semibold border-t border-neutral-200 pt-4">
        <span>Total with tip</span>
        <span>{formatMoney(grandTotal)}</span>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="button"
        disabled={submitting || remainingMs <= 0}
        onClick={() => void submit()}
        className="w-full py-3 rounded-xl bg-black text-white font-medium text-sm hover:bg-neutral-800 disabled:opacity-40"
      >
        {submitting ? 'Processing…' : 'Confirm tip & pay'}
      </button>
    </div>
  );
}
