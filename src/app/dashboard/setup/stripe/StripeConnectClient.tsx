'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  isOnboarded: boolean;
  hasAccount: boolean;
  returnedSuccess: boolean;
  returnedRefresh: boolean;
  requirementsCurrentlyDue: string[];
  disabledReason: string | null;
}

function humanizeRequirement(key: string): string {
  return key
    .replace(/^individual\./, '')
    .replace(/^business_profile\./, '')
    .replace(/^company\./, '')
    .replace(/_/g, ' ');
}

export default function StripeConnectClient({
  isOnboarded,
  hasAccount,
  returnedSuccess,
  returnedRefresh,
  requirementsCurrentlyDue,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function handleConnect() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/restaurant/stripe/connect', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === 'string' ? body.error : 'Failed to start Stripe onboarding.');
        setLoading(false);
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  async function handleRecheck() {
    setError('');
    setRefreshing(true);
    try {
      const res = await fetch('/api/restaurant/stripe/connect/refresh', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === 'string' ? body.error : 'Could not refresh status. Try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }

  if (isOnboarded) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-green-600 text-sm font-bold">OK</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-900">Stripe is connected</p>
          <p className="text-xs text-green-700 mt-0.5">
            Your account is verified and ready to accept payments. Guests can open tabs.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleConnect}
              disabled={loading || refreshing}
              className="text-xs px-3 py-1.5 border border-green-300 text-green-800 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Update Stripe account'}
            </button>
            <button
              onClick={handleRecheck}
              disabled={loading || refreshing}
              className="text-xs px-3 py-1.5 border border-green-300 text-green-800 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {refreshing ? 'Checking…' : 'Re-check status'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {returnedSuccess && !isOnboarded && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
          <p className="text-sm text-yellow-800">
            Stripe is still verifying your information. This can take a few minutes — click
            <span className="font-medium"> Re-check status</span> below.
          </p>
        </div>
      )}

      {returnedRefresh && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800">
            Your onboarding link expired. Click below to get a fresh link and continue where you
            left off.
          </p>
        </div>
      )}

      {!returnedSuccess && !returnedRefresh && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-sm font-semibold text-gray-900">
            {hasAccount ? 'Onboarding incomplete' : 'Not connected'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {hasAccount
              ? 'You started onboarding but did not finish. Click below to continue.'
              : 'Guests cannot open tabs until Stripe is connected.'}
          </p>
        </div>
      )}

      {hasAccount && (requirementsCurrentlyDue.length > 0 || disabledReason) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Stripe still needs:</p>
          {requirementsCurrentlyDue.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-xs text-amber-900 space-y-0.5">
              {requirementsCurrentlyDue.map((key) => (
                <li key={key}>{humanizeRequirement(key)}</li>
              ))}
            </ul>
          ) : null}
          {disabledReason && (
            <p className="mt-1 text-xs text-amber-900">
              Stripe reason: <span className="font-mono">{disabledReason}</span>
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={loading || refreshing}
        className="w-full px-4 py-3 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {loading
          ? 'Connecting...'
          : hasAccount
          ? 'Continue Stripe onboarding'
          : 'Connect Stripe'}
      </button>

      {hasAccount && (
        <button
          onClick={handleRecheck}
          disabled={loading || refreshing}
          className="w-full px-4 py-3 border border-gray-300 text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Checking…' : 'Re-check status'}
        </button>
      )}
    </div>
  );
}
