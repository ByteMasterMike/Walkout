'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PageShell, PageHead } from '@/components/pitch';

// ---------------------------------------------------------------------------
// Types
// TODO: import from src/lib/schemas/serviceRequests.ts once Michael ships it
// ---------------------------------------------------------------------------

type ServiceReqStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';

type ServiceRequest = {
  id: string;
  tableNumber: string;
  type: string;
  dinerName: string;
  notes: string | null;
  status: ServiceReqStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  WATER:          'Water',
  REFILL:         'Refill drink',
  SILVERWARE:     'Silverware',
  EXTRA_PLATE:    'Extra plate',
  TOGO_CONTAINER: 'Togo box',
  HIGH_CHAIR:     'High chair',
  CLEAR_TABLE:    'Clear table',
  SPEAK_TO_SERVER:'Speak to server',
  CLOSE_TAB:      'Close tab',
};

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// Web Audio API chime — avoids needing a binary MP3 asset
function playChime(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.6);
}

// Mock data — TODO: replace with useRestaurantStream SSE subscription
const MOCK_REQUESTS: ServiceRequest[] = [
  { id: 'sr1', tableNumber: '7',  type: 'WATER',         dinerName: 'Michael', notes: null,
    status: 'OPEN',         createdAt: new Date(Date.now() - 134000).toISOString(), acknowledgedAt: null, acknowledgedByName: null },
  { id: 'sr2', tableNumber: '12', type: 'SILVERWARE',     dinerName: 'Sarah',   notes: null,
    status: 'OPEN',         createdAt: new Date(Date.now() - 68000).toISOString(),  acknowledgedAt: null, acknowledgedByName: null },
  { id: 'sr3', tableNumber: '3',  type: 'CLOSE_TAB',      dinerName: 'James',   notes: null,
    status: 'OPEN',         createdAt: new Date(Date.now() - 34000).toISOString(),  acknowledgedAt: null, acknowledgedByName: null },
  { id: 'sr4', tableNumber: '9',  type: 'TOGO_CONTAINER', dinerName: 'Alex',    notes: null,
    status: 'ACKNOWLEDGED', createdAt: new Date(Date.now() - 90000).toISOString(),
    acknowledgedAt: new Date(Date.now() - 60000).toISOString(), acknowledgedByName: 'Jordan' },
];

export default function RequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [, setTick] = useState(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const prevOpenCount = useRef(0);
  const chimeEnabledRef = useRef(chimeEnabled);
  useEffect(() => { chimeEnabledRef.current = chimeEnabled; }, [chimeEnabled]);

  function getAudioCtx(): AudioContext {
    if (!audioCtx.current) {
      audioCtx.current = new AudioContext();
    }
    return audioCtx.current;
  }

  const checkAndChime = useCallback(
    (reqs: ServiceRequest[]) => {
      const openCount = reqs.filter((r) => r.status === 'OPEN').length;
      if (chimeEnabledRef.current && openCount > prevOpenCount.current) {
        try { playChime(getAudioCtx()); } catch { /* AudioContext may be blocked before user gesture */ }
      }
      prevOpenCount.current = openCount;
    },
    []
  );

  useEffect(() => {
    // TODO: replace with useRestaurantStream hook — subscribe to service_request events
    // and call setRequests() on each update, then checkAndChime()
    const sorted = [...MOCK_REQUESTS].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    setRequests(sorted);
    checkAndChime(sorted);

    const interval = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(interval);
  }, [checkAndChime]);

  // Load chime preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('walkout_chime_enabled');
    if (stored === 'false') setChimeEnabled(false);
  }, []);

  function toggleChime() {
    const next = !chimeEnabled;
    setChimeEnabled(next);
    localStorage.setItem('walkout_chime_enabled', String(next));
  }

  async function acknowledge(id: string) {
    // TODO: POST /api/restaurant/service-requests/[id]/acknowledge
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: 'ACKNOWLEDGED' as ServiceReqStatus, acknowledgedAt: new Date().toISOString() }
          : r
      )
    );
  }

  async function resolve(id: string) {
    // TODO: POST /api/restaurant/service-requests/[id]/resolve
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'RESOLVED' as ServiceReqStatus } : r
      )
    );
  }

  const open = requests.filter((r) => r.status === 'OPEN');
  const acknowledged = requests.filter((r) => r.status === 'ACKNOWLEDGED');
  const resolved = requests.filter((r) => r.status === 'RESOLVED');

  return (
    <PageShell>
      <PageHead
        title={
          <>
            Service <em>requests</em>
          </>
        }
        subtitle={
          <>
            {open.length} open{acknowledged.length > 0 ? ` · ${acknowledged.length} acknowledged` : ''}
          </>
        }
        actions={
          <button
            type="button"
            onClick={toggleChime}
            className={`rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] transition-colors ${
              chimeEnabled
                ? 'border-transparent bg-invert text-invert-foreground'
                : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
            }`}
          >
            {chimeEnabled ? 'Chime on' : 'Chime off'}
          </button>
        }
      />

      {requests.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-body text-muted-foreground">No open requests.</p>
        </div>
      ) : (
        <div className="req-list">
          {open.map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              onAcknowledge={acknowledge}
              onResolve={resolve}
            />
          ))}

          {acknowledged.map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              onAcknowledge={acknowledge}
              onResolve={resolve}
            />
          ))}

          {resolved.slice(0, 10).map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              onAcknowledge={acknowledge}
              onResolve={resolve}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function RequestRow({
  req,
  onAcknowledge,
  onResolve,
}: {
  req: ServiceRequest;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const isResolved = req.status === 'RESOLVED';
  const isOpen = req.status === 'OPEN';
  const isAcknowledged = req.status === 'ACKNOWLEDGED';

  return (
    <div
      className={`req ${isAcknowledged || isResolved ? 'ack' : ''} ${isResolved ? '!opacity-50' : ''} flex-wrap sm:flex-nowrap`}
    >
      <div className="dot" />
      <div className="body">
        <div className="ttl">
          Table {req.tableNumber} — {TYPE_LABELS[req.type] ?? req.type}
          {req.notes && (
            <span className="font-body text-[15px] font-normal text-muted-foreground"> ({req.notes})</span>
          )}
        </div>
        <div className="meta">
          {req.dinerName} · {elapsedLabel(req.createdAt)}
          {req.acknowledgedByName && ` · ${req.acknowledgedByName}`}
        </div>
      </div>

      <div className="ml-2 flex shrink-0 flex-wrap gap-2">
        {isOpen && (
          <button
            type="button"
            onClick={() => onAcknowledge(req.id)}
            className="rounded-full bg-invert px-4 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-invert-foreground transition-colors hover:opacity-90"
          >
            Acknowledge
          </button>
        )}
        {isAcknowledged && (
          <button
            type="button"
            onClick={() => onResolve(req.id)}
            className="rounded-full border border-moss/50 bg-moss/15 px-4 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-moss transition-colors hover:bg-moss/25"
          >
            Mark Resolved
          </button>
        )}
        {isResolved && <span className="font-mono text-[10px] text-muted-foreground">Done</span>}
      </div>

    </div>
  );
}
