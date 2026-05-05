'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function JoinPage() {
  const { nfcTagId } = useParams<{ nfcTagId: string }>();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError(body.error ?? 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    const { sessionId } = await res.json();
    router.push(`/tab/${sessionId}`);
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Welcome</h1>
          <p className="mt-1 text-sm text-gray-500">
            Enter your name to open a tab. A{' '}
            <span className="font-medium">$75 hold</span> will appear on your card — you only pay
            for what you order.
          </p>
        </div>

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
              Dietary notes{' '}
              <span className="font-normal text-gray-400">(optional)</span>
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
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !displayName.trim()}
            className="w-full bg-black text-white rounded-lg py-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Opening tab...' : 'Open my tab'}
          </button>
        </form>

        {/* Consent & disclaimers */}
        <div className="mt-6 space-y-3 text-xs text-gray-400">
          <p>
            By continuing you agree that a temporary authorization hold of up to $75 will be placed
            on your payment method. You will only be charged for the items you order plus applicable
            tax and a 0.5% service fee.
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              I agree to receive transactional SMS messages (receipt, departure reminder). Message
              frequency varies. Reply STOP to opt out. Message &amp; data rates may apply.
            </span>
          </label>
        </div>
      </div>
    </main>
  );
}
