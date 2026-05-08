'use client';

import { useState } from 'react';

type Props = {
  initialDeviceId: string | null;
  initialEnabled: boolean;
  initialAllowedIp: string | null;
};

export default function PrinterSetupClient({
  initialDeviceId,
  initialEnabled,
  initialAllowedIp,
}: Props) {
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? '');
  const [enabled, setEnabled] = useState(initialEnabled);
  const [allowedIp, setAllowedIp] = useState(initialAllowedIp ?? '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const pollUrl =
    typeof window !== 'undefined' && deviceId.trim()
      ? `${window.location.origin}/api/cloudprint/${encodeURIComponent(deviceId.trim())}`
      : '';

  const bearerHeader = 'Authorization: Bearer YOUR_CLOUDPRINT_SECRET';

  async function save(partial: {
    cloudPrintDeviceId?: string | null;
    cloudPrintEnabled?: boolean;
    cloudPrintAllowedIp?: string | null;
  }) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/restaurant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Save failed';
        setError(msg);
        return;
      }
      if (typeof data.cloudPrintDeviceId === 'string' || data.cloudPrintDeviceId === null) {
        setDeviceId(data.cloudPrintDeviceId ?? '');
      }
      if (typeof data.cloudPrintEnabled === 'boolean') {
        setEnabled(data.cloudPrintEnabled);
      }
      if ('cloudPrintAllowedIp' in data) {
        setAllowedIp(
          typeof data.cloudPrintAllowedIp === 'string' ? data.cloudPrintAllowedIp : '',
        );
      }
      setMessage('Saved.');
    } finally {
      setSaving(false);
    }
  }

  async function testPrint() {
    setTesting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/restaurant/print-jobs/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Test print failed');
        return;
      }
      setMessage('Test job queued. The printer should fetch it within a few seconds.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {message && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{message}</p>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          CloudPRNT device ID
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Enter the same ID configured on your Star mC-Print3 (CloudPRNT destination).
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="e.g. kitchen-printer-1"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              save({
                cloudPrintDeviceId: deviceId.trim() ? deviceId.trim() : null,
              })
            }
            className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Restrict to IP / CIDR (optional)
        </label>
        <p className="text-xs text-gray-500 mb-2">
          IPv4 only (v1). When set, only requests from this address or range can poll CloudPRNT (your
          restaurant&apos;s public egress). Find your public IP at{' '}
          <span className="font-medium">whatismyip.com</span>. Leave empty for no restriction.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={allowedIp}
            onChange={(e) => setAllowedIp(e.target.value)}
            placeholder="e.g. 203.0.113.10 or 203.0.113.0/24"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              save({
                cloudPrintAllowedIp: allowedIp.trim() === '' ? null : allowedIp.trim(),
              })
            }
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Enable CloudPRNT polling</p>
          <p className="text-xs text-gray-500 mt-0.5">
            When off, print jobs queue but the polling endpoint returns 404 for this device.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => save({ cloudPrintEnabled: !enabled })}
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border border-gray-200 transition-colors ${
            enabled ? 'bg-black' : 'bg-gray-200'
          }`}
          aria-pressed={enabled}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Printer URL</h2>
        <p className="text-xs text-gray-500 mb-2">
          Configure your printer with this URL. Do not put secrets in the URL — use the HTTP header below.
          Set <code className="bg-gray-100 px-1 rounded">CLOUDPRINT_SECRET</code> in your server environment
          (never commit secrets to git). After upgrading from legacy <code className="bg-gray-100 px-1">?token=</code>{' '}
          URLs, rotate <code className="bg-gray-100 px-1">CLOUDPRINT_SECRET</code>.
        </p>
        <div className="flex gap-2 items-start">
          <pre className="flex-1 text-xs bg-gray-100 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {pollUrl || 'Save a device ID to preview the URL.'}
          </pre>
          <button
            type="button"
            disabled={!pollUrl}
            onClick={() => pollUrl && navigator.clipboard.writeText(pollUrl)}
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 shrink-0"
          >
            Copy URL
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">HTTP header</h2>
        <p className="text-xs text-gray-500 mb-2">
          Your printer must send this header on every poll and ack request. Replace{' '}
          <code className="bg-gray-100 px-1">YOUR_CLOUDPRINT_SECRET</code> with your{' '}
          <code className="bg-gray-100 px-1">CLOUDPRINT_SECRET</code> value.
        </p>
        <div className="flex gap-2 items-start">
          <pre className="flex-1 text-xs bg-gray-100 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {bearerHeader}
          </pre>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(bearerHeader)}
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0"
          >
            Copy
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          disabled={testing || !enabled}
          onClick={testPrint}
          className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {testing ? 'Queueing…' : 'Send test print'}
        </button>
      </div>
    </div>
  );
}
