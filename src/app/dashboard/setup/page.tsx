'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import TipDistributionSection from './TipDistributionSection';
import { PageShell, PageHead } from '@/components/pitch';

type DiningTable = {
  id: string;
  tableNumber: string;
  nfcTagId: string;
  status: string;
  createdAt: string;
  isActive: boolean;
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
    const res = await fetch('/api/restaurant/tables?includeInactive=true', { credentials: 'include' });
    if (res.ok) {
      const data = (await res.json()) as { tables: DiningTable[] };
      setTables(data.tables);
    }
  }

  useEffect(() => { loadTables(); }, []);

  const [deleteTarget, setDeleteTarget] = useState<DiningTable | null>(null);
  const [deletingTable, setDeletingTable] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [hideTarget, setHideTarget] = useState<DiningTable | null>(null);
  const [hideBusy, setHideBusy] = useState(false);
  const [patchingTableId, setPatchingTableId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/restaurant/tables', {
      method: 'POST',
      credentials: 'include',
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

  async function confirmDeleteTable() {
    if (!deleteTarget) return;
    setDeletingTable(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/restaurant/tables/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        setDeleteError(
          typeof body.error === 'string'
            ? body.error
            : 'This table cannot be deleted because it has tab history.',
        );
        return;
      }
      if (!res.ok) {
        setDeleteError(typeof body.error === 'string' ? body.error : 'Could not remove table.');
        return;
      }
      setDeleteTarget(null);
      await loadTables();
    } finally {
      setDeletingTable(false);
    }
  }

  async function patchTableActive(
    tableId: string,
    isActive: boolean,
  ): Promise<{ ok: boolean; message?: string }> {
    setPatchingTableId(tableId);
    try {
      const res = await fetch(`/api/restaurant/tables/${tableId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = typeof body.error === 'string' ? body.error : 'Could not update table.';
        return { ok: false, message: msg };
      }
      await loadTables();
      return { ok: true };
    } finally {
      setPatchingTableId(null);
    }
  }

  async function confirmHideTable() {
    if (!hideTarget) return;
    setHideBusy(true);
    setError('');
    try {
      const r = await patchTableActive(hideTarget.id, false);
      if (!r.ok) setError(r.message ?? 'Could not hide table.');
      else setHideTarget(null);
    } finally {
      setHideBusy(false);
    }
  }

  async function hideInsteadFromDeleteModal() {
    if (!deleteTarget) return;
    setDeletingTable(true);
    setDeleteError('');
    try {
      const r = await patchTableActive(deleteTarget.id, false);
      if (!r.ok) setDeleteError(r.message ?? 'Could not hide table.');
      else setDeleteTarget(null);
    } finally {
      setDeletingTable(false);
    }
  }

  return (
    <PageShell>
      <PageHead
        title={
          <>
            Table <em>setup</em>
          </>
        }
        subtitle={
          <>
            Create tables and NFC join URLs. Hide tables you no longer use (guests cannot join while
            hidden); remove only clears unused tables with no tab history.
          </>
        }
        actions={
          <Link
            href="/dashboard/setup/printer"
            className="rounded-full border border-border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Receipt printer →
          </Link>
        }
      />

      <form onSubmit={handleCreate} className="t-add">
        <input
          type="text"
          required
          placeholder="Table number or name (e.g. 1 or Bar)"
          value={newTable}
          onChange={(e) => setNewTable(e.target.value)}
          className="min-h-[48px] flex-1 rounded-[10px] border border-border bg-scrim-2 px-4 py-2 font-body text-[17px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-invert px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-invert-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add table'}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {tables.length === 0 ? (
        <p className="py-10 text-center font-body text-sm text-muted-foreground">No tables yet. Add one above.</p>
      ) : (
        <>
          {(() => {
            const activeTables = tables.filter((t) => t.isActive);
            const hiddenTables = tables.filter((t) => !t.isActive);

            function renderRow(t: DiningTable, variant: 'active' | 'hidden') {
              const url = getNfcUrl(t.nfcTagId);
              const busy = patchingTableId === t.id;
              return (
                <div
                  key={t.id}
                  className={`url-row ${variant === 'hidden' ? 'opacity-75' : ''}`}
                >
                  <div className="l">
                    <div className="t">
                      Table {t.tableNumber}
                      {variant === 'hidden' ? (
                        <span className="ml-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          · Hidden
                        </span>
                      ) : null}
                    </div>
                    <div className="u">{url}</div>
                  </div>
                  <div className="r flex-wrap">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="rounded-full border border-border px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-scrim-2 disabled:opacity-50"
                    >
                      Copy URL
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => downloadQr(t.nfcTagId, t.tableNumber)}
                      className="rounded-full bg-invert px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-wider text-invert-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      QR code
                    </button>
                    {variant === 'active' ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setHideTarget(t);
                          }}
                          className="rounded-full border border-border px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                        >
                          Hide
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setDeleteError('');
                            setDeleteTarget(t);
                          }}
                          className="rounded-full border border-destructive/40 px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-wider text-destructive/90 transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void patchTableActive(t.id, true).then((r) => {
                            if (!r.ok) setError(r.message ?? 'Could not restore table.');
                            else setError('');
                          })
                        }
                        className="rounded-full border border-moss/50 bg-moss/15 px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-wider text-moss transition-colors hover:bg-moss/25 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-8">
                <div className="space-y-0">
                  {activeTables.length === 0 ? (
                    <p className="py-6 text-center font-body text-sm text-muted-foreground">
                      No active tables.{hiddenTables.length > 0 ? ' Restore one below or add a new table.' : ''}
                    </p>
                  ) : (
                    activeTables.map((t) => renderRow(t, 'active'))
                  )}
                </div>

                {hiddenTables.length > 0 ? (
                  <div>
                    <p className="mb-3 font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                      Hidden tables
                    </p>
                    <p className="mb-3 font-body text-sm text-muted-foreground">
                      Diners cannot join via NFC while a table is hidden. URLs stay the same when you
                      restore.
                    </p>
                    <div className="space-y-0">{hiddenTables.map((t) => renderRow(t, 'hidden'))}</div>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => !deletingTable && setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-md rounded-t-[14px] border border-border bg-card p-6 shadow-xl sm:rounded-[14px]">
            <h2 className="mb-2 font-display text-xl font-light text-foreground">Remove table?</h2>
            <p className="mb-4 font-body text-sm text-muted-foreground">
              Table &quot;{deleteTarget.tableNumber}&quot; and its join URL will be removed permanently.
              You can only delete tables that have{' '}
              <strong className="font-medium text-foreground">never</strong> hosted a diner tab.
            </p>
            {deleteError && (
              <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <div className="flex flex-col gap-3">
              {deleteError ? (
                <button
                  type="button"
                  disabled={deletingTable}
                  onClick={() => void hideInsteadFromDeleteModal()}
                  className="w-full rounded-xl border border-border py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-scrim-2 disabled:opacity-50"
                >
                  Hide table instead
                </button>
              ) : null}
              <div className="flex gap-3">
              <button
                type="button"
                disabled={deletingTable}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-border py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-scrim-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingTable}
                onClick={() => void confirmDeleteTable()}
                className="flex-1 rounded-xl bg-destructive py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {deletingTable ? 'Removing...' : 'Remove table'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {hideTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => !hideBusy && setHideTarget(null)}
          />
          <div className="relative w-full max-w-md rounded-t-[14px] border border-border bg-card p-6 shadow-xl sm:rounded-[14px]">
            <h2 className="mb-2 font-display text-xl font-light text-foreground">Hide table?</h2>
            <p className="mb-4 font-body text-sm text-muted-foreground">
              Table &quot;{hideTarget.tableNumber}&quot; stays in your account but disappears from Live Tables and
              Floor Setup. Diners who tap this table&apos;s NFC tag will not be able to join until you
              restore it.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={hideBusy}
                onClick={() => setHideTarget(null)}
                className="flex-1 rounded-xl border border-border py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-scrim-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={hideBusy}
                onClick={() => void confirmHideTable()}
                className="flex-1 rounded-xl bg-invert py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-invert-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {hideBusy ? 'Hiding...' : 'Hide table'}
              </button>
            </div>
          </div>
        </div>
      )}

      <TipDistributionSection />
    </PageShell>
  );
}
