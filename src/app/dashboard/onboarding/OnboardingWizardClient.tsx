'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

type WizardProps = {
  role: 'ADMIN' | 'MANAGER';
  initial: {
    stripeConnectOnboarded: boolean;
    taxRate: string;
    taxLabel: string;
    timezone: string;
    cloudPrintDeviceId: string | null;
    tableCount: number;
    menuItemCount: number;
    onboardingCompletedAt: string | null;
  };
};

const STEPS = [
  'Stripe Connect',
  'Tables',
  'Menu',
  'Tax & timezone',
  'Tip distribution',
  'Printer',
  'Staff',
  'Done',
] as const;

export default function OnboardingWizardClient({ role, initial }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [tableCount, setTableCount] = useState(initial.tableCount);
  const [menuItemCount, setMenuItemCount] = useState(initial.menuItemCount);
  const [newTable, setNewTable] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [taxRate, setTaxRate] = useState(String(Number(initial.taxRate) * 100));
  const [taxLabel, setTaxLabel] = useState(initial.taxLabel);
  const [timezone, setTimezone] = useState(initial.timezone);

  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    setMenuItemCount(initial.menuItemCount);
    setTableCount(initial.tableCount);
  }, [initial.menuItemCount, initial.tableCount]);

  useEffect(() => {
    if (step === 2) {
      router.refresh();
    }
  }, [step, router]);

  async function refreshTableCount() {
    const tRes = await fetch('/api/restaurant/tables');
    if (tRes.ok) {
      const d = await tRes.json();
      setTableCount((d.tables as { id: string }[]).length);
    }
  }

  async function addTable(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      setError('Only an admin can create tables from this wizard.');
      return;
    }
    setError('');
    setLoading(true);
    const res = await fetch('/api/restaurant/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: newTable }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'Could not create table');
    } else {
      setNewTable('');
      await refreshTableCount();
    }
    setLoading(false);
  }

  async function saveTax(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const rateNum = Number(taxRate);
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 50) {
      setError('Enter tax rate between 0 and 50 (percent).');
      setLoading(false);
      return;
    }
    const res = await fetch('/api/restaurant/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taxRate: rateNum / 100,
        taxLabel: taxLabel.trim(),
        timezone: timezone.trim(),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'Could not save settings');
    }
    setLoading(false);
  }

  async function finishOnboarding() {
    setError('');
    setLoading(true);
    const res = await fetch('/api/restaurant/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completeOnboarding: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'Could not complete');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  function skip() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-2">Setup</p>
        <h1 className="text-2xl font-bold text-gray-900">Restaurant onboarding</h1>
        <p className="text-sm text-gray-500 mt-1">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <div className="mt-4 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-gray-900 transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm min-h-[240px]">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Connect Stripe so WalkOut can route payouts and card charges.
            </p>
            {initial.stripeConnectOnboarded ? (
              <p className="text-green-700 text-sm font-medium">✓ Stripe Connect is onboarded.</p>
            ) : (
              <p className="text-amber-800 text-sm">Stripe Connect not completed yet.</p>
            )}
            {isAdmin && (
              <Link
                href="/dashboard/setup/stripe"
                className="inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Open Stripe setup
              </Link>
            )}
            {!isAdmin && (
              <p className="text-xs text-gray-500">Ask an admin to complete Stripe Connect.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Create at least one table to generate join URLs / QR codes.
            </p>
            <p className="text-sm">
              Active tables: <strong>{tableCount}</strong>
            </p>
            {isAdmin ? (
              <form onSubmit={addTable} className="flex gap-2 flex-wrap">
                <input
                  className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Table number or name"
                  value={newTable}
                  onChange={(e) => setNewTable(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Add table
                </button>
              </form>
            ) : (
              <p className="text-xs text-gray-500">Ask an admin to create tables.</p>
            )}
            <Link href="/dashboard/setup" className="text-sm font-medium text-gray-900 underline">
              Full table & QR setup →
            </Link>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Publish at least one menu item diners can order.</p>
            {menuItemCount >= 1 ? (
              <p className="text-green-700 text-sm font-medium">✓ Menu has items.</p>
            ) : (
              <p className="text-amber-800 text-sm">No menu items yet.</p>
            )}
            <Link
              href="/dashboard/menu"
              className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Open menu editor
            </Link>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={saveTax} className="space-y-4">
            <p className="text-sm text-gray-600">
              Tax label and rate snap onto orders; timezone drives reporting days.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tax rate (%)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={50}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tax label</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={taxLabel}
                onChange={(e) => setTaxLabel(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">IANA timezone</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                maxLength={80}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Save tax settings
            </button>
          </form>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Choose direct vs pooled tip reporting on the setup page.
            </p>
            <Link
              href="/dashboard/setup#tip-distribution"
              className="inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Tip distribution settings
            </Link>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Optional CloudPRNT device id for ticket printing.
            </p>
            {initial.cloudPrintDeviceId ? (
              <p className="text-green-700 text-sm font-medium">✓ Printer device configured.</p>
            ) : (
              <p className="text-xs text-gray-500">No printer device id on file.</p>
            )}
            {isAdmin && (
              <Link
                href="/dashboard/setup/printer"
                className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Printer setup
              </Link>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Invite servers and managers.</p>
            <Link
              href="/dashboard/setup/staff"
              className="inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Staff invites
            </Link>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              You can revisit any step later from the dashboard. Mark onboarding complete when you&apos;re ready for
              service.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={finishOnboarding}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Mark complete & open dashboard
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <button
          type="button"
          className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          ← Back
        </button>
        <div className="flex gap-3">
          <button type="button" className="text-sm text-gray-500 hover:text-gray-800" onClick={skip}>
            Skip step
          </button>
          {step < STEPS.length - 1 && (
            <button
              type="button"
              className="text-sm font-medium text-gray-900 underline"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
