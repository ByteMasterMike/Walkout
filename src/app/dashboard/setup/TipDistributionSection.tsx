'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

type Settings = {
  tipDistributionMode: 'DIRECT' | 'POOL';
  absorbTipProcessingFee: boolean;
  tipPoolDisclaimerAt: string | null;
};

export default function TipDistributionSection() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const isAdmin = session?.user?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/restaurant/settings');
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = (await res.json()) as Settings;
      if (!cancelled) {
        setSettings(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin || loading || !settings) {
    return null;
  }

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/restaurant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Update failed');
        return;
      }
      setSettings({
        tipDistributionMode: data.tipDistributionMode,
        absorbTipProcessingFee: data.absorbTipProcessingFee,
        tipPoolDisclaimerAt: data.tipPoolDisclaimerAt,
      });
    } finally {
      setSaving(false);
    }
  }

  function onModeChange(next: 'DIRECT' | 'POOL') {
    if (!settings) return;
    if (next === 'POOL' && !settings.tipPoolDisclaimerAt) {
      setShowModal(true);
      return;
    }
    patch({ tipDistributionMode: next });
  }

  async function confirmPoolDisclaimer() {
    await patch({
      tipDistributionMode: 'POOL',
      tipPoolDisclaimerAccepted: true,
    });
    setShowModal(false);
  }

  return (
    <div id="tip-distribution" className="mt-12 border-t border-gray-100 pt-10">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Tip distribution</h2>
      <p className="text-sm text-gray-500 mb-6">
        How tips are attributed for reporting. Pool mode aggregates tips by shift; direct mode shows
        per-server totals.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="space-y-4">
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Mode</span>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => onModeChange('DIRECT')}
              className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                settings.tipDistributionMode === 'DIRECT'
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              Direct (per server)
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onModeChange('POOL')}
              className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                settings.tipDistributionMode === 'POOL'
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              Pool (shift total)
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-gray-900">Absorb card fee on tips</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Restaurant absorbs the pro-rata processing share from tips (servers see gross in reports).
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => patch({ absorbTipProcessingFee: !settings.absorbTipProcessingFee })}
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border border-gray-200 transition-colors ${
              settings.absorbTipProcessingFee ? 'bg-black' : 'bg-gray-200'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                settings.absorbTipProcessingFee ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </label>

        {settings.tipPoolDisclaimerAt && (
          <p className="text-xs text-gray-400">
            Tip pool legal notice accepted{' '}
            {new Date(settings.tipPoolDisclaimerAt).toLocaleString()}
          </p>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Tip Pool Legal Notice</h3>
            <div className="text-sm text-gray-700 space-y-3 whitespace-pre-line">
              {`⚠️ Tip Pool Legal Notice
Under the federal Fair Labor Standards Act (as amended 2018):

- If you pay all staff full minimum wage (no tip credit): you may
  include back-of-house staff in tip pools.
- If you take a tip credit for tipped employees: tip pools may
  only include front-of-house staff.
- Employers may NEVER retain any portion of tips.

WalkOut tracks and reports tip amounts only.
Distribution is your legal responsibility.`}
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                type="button"
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                onClick={() => {
                  setShowModal(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800"
                onClick={confirmPoolDisclaimer}
              >
                I understand — enable pool mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
