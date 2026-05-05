'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type DiningTable = {
  id: string;
  tableNumber: string;
  nfcTagId: string;
  status: string;
  createdAt: string;
};

function getNfcUrl(nfcTagId: string) {
  const base =
    typeof window !== 'undefined' ? window.location.origin : 'https://walkoutofficial.com';
  return `${base}/join/${nfcTagId}`;
}

async function downloadQr(nfcTagId: string, tableNumber: string) {
  const url = getNfcUrl(nfcTagId);
  const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `table-${tableNumber}-qr.png`;
  a.click();
}

export default function SetupPage() {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [newTable, setNewTable] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadTables() {
    const res = await fetch('/api/restaurant/tables');
    if (res.ok) {
      const data = await res.json();
      setTables(data.tables);
    }
  }

  useEffect(() => { loadTables(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/restaurant/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: newTable }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to create table');
    } else {
      setNewTable('');
      await loadTables();
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Table Setup</h1>
      <p className="text-sm text-gray-500 mb-8">
        Create tables and get NFC tag URLs. Program each NFC sticker with its URL using an NFC
        writer app.
      </p>

      {/* Create table */}
      <form onSubmit={handleCreate} className="flex gap-3 mb-8">
        <input
          type="text"
          required
          placeholder="Table number or name (e.g. 1 or Bar)"
          value={newTable}
          onChange={(e) => setNewTable(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Adding...' : 'Add table'}
        </button>
      </form>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Table list */}
      {tables.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No tables yet. Add one above.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {tables.map((t) => {
            const url = getNfcUrl(t.nfcTagId);
            return (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 bg-white">
                <div>
                  <p className="text-sm font-medium text-gray-900">Table {t.tableNumber}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-xs">{url}</p>
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button
                    onClick={() => navigator.clipboard.writeText(url)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Copy URL
                  </button>
                  <button
                    onClick={() => downloadQr(t.nfcTagId, t.tableNumber)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    QR code
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
