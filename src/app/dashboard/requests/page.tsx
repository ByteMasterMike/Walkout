'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

  function getAudioCtx(): AudioContext {
    if (!audioCtx.current) {
      audioCtx.current = new AudioContext();
    }
    return audioCtx.current;
  }

  const checkAndChime = useCallback(
    (reqs: ServiceRequest[]) => {
      const openCount = reqs.filter((r) => r.status === 'OPEN').length;
      if (chimeEnabled && openCount > prevOpenCount.current) {
        try { playChime(getAudioCtx()); } catch { /* AudioContext may be blocked before user gesture */ }
      }
      prevOpenCount.current = openCount;
    },
    [chimeEnabled]
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Service Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {open.length} open{acknowledged.length > 0 ? `, ${acknowledged.length} acknowledged` : ''}
          </p>
        </div>
        <button
          onClick={toggleChime}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            chimeEnabled
              ? 'bg-gray-900 text-white border-gray-900'
              : 'text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          {chimeEnabled ? 'Chime on' : 'Chime off'}
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400">No open requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Open requests */}
          {open.map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              onAcknowledge={acknowledge}
              onResolve={resolve}
            />
          ))}

          {/* Acknowledged */}
          {acknowledged.map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              onAcknowledge={acknowledge}
              onResolve={resolve}
            />
          ))}

          {/* Resolved (last 10, dimmed) */}
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
    </div>
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
      className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
        isResolved
          ? 'bg-gray-50 border-gray-100 opacity-50'
          : isAcknowledged
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-gray-200 shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          isResolved ? 'bg-gray-300' : isAcknowledged ? 'bg-blue-400' : 'bg-amber-400'
        }`} />
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${isResolved ? 'text-gray-400' : 'text-gray-900'}`}>
            Table {req.tableNumber} — {TYPE_LABELS[req.type] ?? req.type}
            {req.notes && <span className="font-normal text-gray-500"> ({req.notes})</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {req.dinerName} &middot; {elapsedLabel(req.createdAt)}
            {req.acknowledgedByName && ` &middot; ${req.acknowledgedByName}`}
          </p>
        </div>
      </div>

      <div className="flex gap-2 ml-4 shrink-0">
        {isOpen && (
          <button
            onClick={() => onAcknowledge(req.id)}
            className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Acknowledge
          </button>
        )}
        {isAcknowledged && (
          <button
            onClick={() => onResolve(req.id)}
            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Mark Resolved
          </button>
        )}
        {isResolved && (
          <span className="text-xs text-gray-400">Done</span>
        )}
      </div>
    </div>
  );
}
