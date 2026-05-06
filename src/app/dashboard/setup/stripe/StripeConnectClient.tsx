'use client';

import { useState } from 'react';

interface Props {
  isOnboarded: boolean;
  hasAccount: boolean;
  returnedSuccess: boolean;
  returnedRefresh: boolean;
}

export default function StripeConnectClient({
  isOnboarded,
  hasAccount,
  returnedSuccess,
  returnedRefresh,
}: Props) {
  const [loading, setLoading] = useState(false);
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

  if (isOnboarded) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-green-600 text-sm font-bold">OK</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-green-900">Stripe is connected</p>
          <p className="text-xs text-green-700 mt-0.5">
            Your account is verified and ready to accept payments. Guests can open tabs.
          </p>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="mt-3 text-xs px-3 py-1.5 border border-green-300 text-green-800 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading...' : 'Update Stripe account'}
          </button>
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
            Stripe is still verifying your information. This can take a few minutes. Refresh the
            page or check your email for next steps.
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={loading}
        className="w-full px-4 py-3 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {loading
          ? 'Connecting...'
          : hasAccount
          ? 'Continue Stripe onboarding'
          : 'Connect Stripe'}
      </button>
    </div>
  );
}
