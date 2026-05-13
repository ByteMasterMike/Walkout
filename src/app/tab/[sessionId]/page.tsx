'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Decimal from 'decimal.js';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useIdleWarning } from '@/hooks/useIdleWarning';
import IdleWarningToast from '@/components/IdleWarningToast';
import { useSessionStream } from '@/hooks/useSessionStream';
import { PhoneFrame } from '@/components/pitch';
import { SearchGlyphIcon } from '@/components/icons/prototype';

type MenuItemData = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  allergens: string[];
  isPopular: boolean;
  isAvailable: boolean;
  categoryId: string | null;
};

type MenuCategoryData = {
  id: string;
  name: string;
  items: MenuItemData[];
};

type OrderItemData = {
  id: string;
  menuItemName: string;
  unitPrice: string;
  taxAmount: string;
  quantity: number;
  notes: string | null;
  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'PREPPING'
    | 'SERVED'
    | 'CANCELLED'
    | 'CASH_PENDING';
};

type ServiceRequestData = {
  id: string;
  type: ServiceRequestType;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
};

type ServiceRequestType =
  | 'WATER'
  | 'REFILL'
  | 'SILVERWARE'
  | 'EXTRA_PLATE'
  | 'TOGO_CONTAINER'
  | 'HIGH_CHAIR'
  | 'CLEAR_TABLE'
  | 'SPEAK_TO_SERVER'
  | 'CLOSE_TAB';

type ApiSession = {
  id: string;
  status: string;
  restaurantName: string;
  tableNumber: string;
  taxRate: string;
  taxEnabled: boolean;
  walkOutServiceFeePercent: string;
  walkOutServiceFeeFlat: number;
};

type ApiParticipant = {
  id: string;
  displayName: string;
  isHost: boolean;
  joinedAt: string;
  departedAt: string | null;
  holdStatus: string;
  captureStatus: string;
};

const SERVICE_REQUEST_LABELS: Record<ServiceRequestType, string> = {
  WATER: 'Water',
  REFILL: 'Refill drink',
  SILVERWARE: 'Silverware',
  EXTRA_PLATE: 'Extra plate',
  TOGO_CONTAINER: 'Togo box',
  HIGH_CHAIR: 'High chair',
  CLEAR_TABLE: 'Clear table',
  SPEAK_TO_SERVER: 'Speak to server',
  CLOSE_TAB: 'Close tab',
};

const QUICK_REQUESTS: ServiceRequestType[] = ['WATER', 'SILVERWARE', 'TOGO_CONTAINER', 'REFILL'];

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PREPPING: 'Preparing',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
  CASH_PENDING: 'Cash pending',
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border-blue-200',
  PREPPING: 'bg-orange-50 text-orange-700 border-orange-200',
  SERVED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-100 text-gray-400 border-gray-200',
  CASH_PENDING: 'bg-gray-100 text-gray-600 border-gray-200',
};

const SERVICE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Sent — your server is on the way',
  ACKNOWLEDGED: 'Your server is coming',
  RESOLVED: 'Done',
  CANCELLED: 'Cancelled',
};

function TabPageInner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mockHoldParam =
    process.env.NODE_ENV === 'development' ? searchParams.get('mockHold') : null;

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [sessionRow, setSessionRow] = useState<ApiSession | null>(null);
  const [participants, setParticipants] = useState<ApiParticipant[]>([]);
  const [orders, setOrders] = useState<OrderItemData[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestData[]>([]);
  const [categories, setCategories] = useState<MenuCategoryData[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [showMoreRequests, setShowMoreRequests] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<ServiceRequestType | null>(null);
  const [requestToast, setRequestToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    const [sRes, mRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      fetch(`/api/sessions/${sessionId}/menu`),
    ]);

    if (!sRes.ok) {
      setBootError('Could not load your tab. Try scanning the QR code again.');
      return;
    }

    const sJson = (await sRes.json()) as {
      session: ApiSession;
      participants: ApiParticipant[];
      orders: Array<{
        id: string;
        menuItemName: string;
        unitPrice: string;
        taxAmount: string;
        quantity: number;
        notes: string | null;
        status: OrderItemData['status'];
      }>;
      serviceRequests: Array<{
        id: string;
        type: ServiceRequestType;
        status: ServiceRequestData['status'];
      }>;
    };

    setSessionRow(sJson.session);
    setParticipants(sJson.participants);
    setOrders(
      sJson.orders.map((o) => ({
        id: o.id,
        menuItemName: o.menuItemName,
        unitPrice: o.unitPrice,
        taxAmount: o.taxAmount,
        quantity: o.quantity,
        notes: o.notes,
        status: o.status,
      })),
    );
    setServiceRequests(
      sJson.serviceRequests.map((sr) => ({
        id: sr.id,
        type: sr.type,
        status: sr.status,
      })),
    );

    if (mRes.ok) {
      const mJson = (await mRes.json()) as { categories: MenuCategoryData[] };
      setCategories(mJson.categories ?? []);
    }
  }, [sessionId]);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('walkout_banner_dismissed');
      if (!dismissed) setBannerDismissed(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setBootError(null);
      try {
        const pid = sessionStorage.getItem(`walkout_participant_${sessionId}`);
        if (!pid) {
          setBootError('Open your tab by scanning the table QR code first.');
          return;
        }
        setParticipantId(pid);
        await loadSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadSession]);

  useHeartbeat(sessionId ?? null, participantId ?? null);
  const { isIdle, resetIdle } = useIdleWarning();

  const reloadRef = useRef(loadSession);
  reloadRef.current = loadSession;

  useSessionStream({
    sessionId: sessionId ?? '',
    enabled: Boolean(sessionId && participantId),
    onEvent: () => {
      void reloadRef.current();
    },
    onReconnect: () => {
      void reloadRef.current();
    },
  });

  useEffect(() => {
    const st = sessionRow?.status;
    if (!st || !sessionId) return;
    if (st === 'AWAITING_TIP' || st === 'CAPTURING' || st === 'CLOSING') {
      router.replace(`/tab/${sessionId}/pay`);
    }
  }, [sessionRow?.status, sessionId, router]);

  const me = useMemo(
    () => participants.find((p) => p.id === participantId),
    [participants, participantId],
  );

  let holdStatus = me?.holdStatus ?? 'NONE';
  if (
    process.env.NODE_ENV === 'development' &&
    mockHoldParam &&
    ['NONE', 'PENDING', 'HELD', 'FAILED', 'RELEASED', 'EXPIRED', 'REAUTHORIZING'].includes(mockHoldParam)
  ) {
    holdStatus = mockHoldParam;
  }

  const holdFailed = holdStatus === 'FAILED';

  const filteredCategories = categories.map((cat) => ({
    ...cat,
    items: cat.items.filter((item) => {
      if (!item.isAvailable) return false;
      if (selectedCategory && selectedCategory !== cat.id) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.description?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    }),
  })).filter((cat) => cat.items.length > 0);

  const allItems = categories.flatMap((c) => c.items);
  const popularItems = allItems.filter((i) => i.isPopular && i.isAvailable);

  const activeOrders = orders.filter((o) => o.status !== 'CANCELLED');

  const flowSteps = useMemo(
    () => [
      { n: '01', label: 'Tap NFC', active: holdStatus === 'NONE' || holdStatus === 'PENDING' },
      { n: '02', label: 'Hold placed', active: holdStatus === 'HELD' },
      { n: '03', label: 'Browse menu', active: holdStatus === 'HELD' },
      { n: '04', label: 'Your tab', active: activeOrders.length > 0 },
      { n: '05', label: 'Pay & leave', active: false },
    ],
    [holdStatus, activeOrders.length],
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const subtotal = activeOrders.reduce(
    (sum, o) => sum.plus(new Decimal(o.unitPrice).times(o.quantity)),
    new Decimal(0),
  );
  const tax = activeOrders.reduce((sum, o) => sum.plus(new Decimal(o.taxAmount)), new Decimal(0));
  const feePct = sessionRow ? new Decimal(sessionRow.walkOutServiceFeePercent) : new Decimal(0);
  const flatCents = sessionRow?.walkOutServiceFeeFlat ?? 0;
  const serviceFee = sessionRow
    ? subtotal.times(feePct).plus(new Decimal(flatCents).dividedBy(100)).toDecimalPlaces(2)
    : new Decimal(0);
  const total = subtotal.plus(tax).plus(serviceFee);

  const feePercentLabel = sessionRow
    ? new Decimal(sessionRow.walkOutServiceFeePercent).times(100).toFixed(2)
    : '0.50';

  const activeRequests = serviceRequests.filter(
    (r) => r.status === 'OPEN' || r.status === 'ACKNOWLEDGED',
  );

  function dismissBanner() {
    localStorage.setItem('walkout_banner_dismissed', '1');
    setBannerDismissed(true);
  }

  async function handleAddToTab() {
    if (!selectedItem || !sessionId) return;
    setAddingItem(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: selectedItem.id,
          quantity: 1,
          notes: kitchenNotes || undefined,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        order: {
          id: string;
          unitPrice: string;
          taxAmount: string;
          quantity: number;
          notes: string | null;
          status: OrderItemData['status'];
        };
      };
      const o = data.order;
      setOrders((prev) => [
        ...prev,
        {
          id: o.id,
          menuItemName: selectedItem.name,
          unitPrice: o.unitPrice,
          taxAmount: o.taxAmount,
          quantity: o.quantity,
          notes: o.notes,
          status: o.status,
        },
      ]);
      setSelectedItem(null);
      setKitchenNotes('');
    } finally {
      setAddingItem(false);
    }
  }

  async function sendServiceRequest(type: ServiceRequestType) {
    if (!sessionId) return;
    setSendingRequest(type);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/service-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        serviceRequest: {
          id: string;
          type: ServiceRequestType;
          status: ServiceRequestData['status'];
        };
      };
      setServiceRequests((prev) => [
        ...prev,
        {
          id: data.serviceRequest.id,
          type: data.serviceRequest.type,
          status: data.serviceRequest.status,
        },
      ]);
      setShowMoreRequests(false);

      if (toastTimer.current) clearTimeout(toastTimer.current);
      setRequestToast(
        `${SERVICE_REQUEST_LABELS[type]} — request sent. Your server will be right with you.`,
      );
      toastTimer.current = setTimeout(() => setRequestToast(''), 4000);
    } finally {
      setSendingRequest(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading your tab...</p>
      </div>
    );
  }

  if (bootError || !sessionRow) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <p className="text-sm text-gray-700 text-center mb-4">{bootError ?? 'Something went wrong.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="diner-page mx-auto max-w-[1400px] px-4 pb-8 pt-4 lg:px-8">
          <aside className="diner-rail hidden lg:block">
            <div className="mono-am mb-2">N° 01 — The sequence</div>
            <h2>
              Your <em>tab</em>
            </h2>
            <p>Order from the menu, track your check, and leave when you&apos;re ready.</p>
            <nav className="flow-nav" aria-label="Tab steps">
              {flowSteps.map((s) => (
                <button
                  key={s.n}
                  type="button"
                  className={s.active ? 'on' : ''}
                  onClick={() => {
                    if (s.label === 'Browse menu') menuRef.current?.scrollIntoView({ behavior: 'smooth' });
                    if (s.label === 'Your tab') tabRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <span className="n">{s.n}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <PhoneFrame>
            <header className="mb-3 flex items-center justify-between gap-3">
              <div className="d-pill !max-w-[85%]">
                <span className="dot" />
                <span className="truncate">
                  Table {sessionRow.tableNumber} · {sessionRow.restaurantName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--p-muted)] transition-colors hover:bg-white/5"
                aria-label="Search menu"
              >
                <SearchGlyphIcon />
              </button>
            </header>

            {showSearch && (
              <div className="d-search mb-2">
                <SearchGlyphIcon />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search menu..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent font-body text-sm text-[var(--p-text)] placeholder:text-[var(--p-muted)] focus:outline-none"
                />
              </div>
            )}

      {!bannerDismissed && (
        <div className="mx-4 mt-4 bg-gray-900 text-white rounded-xl p-4">
          <p className="text-sm font-semibold mb-1">How WalkOut Works</p>
          <ol className="text-xs text-gray-300 space-y-1 list-decimal list-inside">
            <li>Order right from this page</li>
            <li>Eat without thinking about the check</li>
            <li>Just leave — we&apos;ll charge your card and send your receipt</li>
          </ol>
          <button
            type="button"
            onClick={dismissBanner}
            className="mt-3 text-xs text-gray-400 hover:text-white underline"
          >
            Got it, thanks
          </button>
        </div>
      )}

      {holdFailed && (
        <div className="sticky top-14 z-10 mx-0 bg-red-600 text-white px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold">Card declined — ordering is paused</p>
            <p className="text-xs mt-0.5 text-red-100">
              Please speak to your server to update your payment method before placing an order.
            </p>
          </div>
        </div>
      )}

      {holdStatus === 'HELD' && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xs text-green-700">
            Your card is on hold. You&apos;ll only be charged for what you order.
          </p>
        </div>
      )}

      <div ref={menuRef}>
        {popularItems.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Featured</p>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              {popularItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!holdFailed) {
                      setSelectedItem(item);
                      setKitchenNotes('');
                    }
                  }}
                  disabled={holdFailed}
                  className={`shrink-0 w-36 bg-white border border-gray-200 rounded-xl p-3 text-left transition-colors ${holdFailed ? 'opacity-40 cursor-not-allowed' : 'hover:border-gray-400'}`}
                >
                  {item.imageUrl ? (
                    <div className="w-full h-20 rounded-lg bg-gray-100 overflow-hidden mb-2">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full h-20 rounded-lg bg-gray-100 mb-2" />
                  )}
                  <p className="text-xs font-semibold text-gray-900 line-clamp-1">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">${item.price}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6 overflow-x-auto pb-1 -mx-4 px-4">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedCategory === null
                ? 'bg-gray-900 text-white border-gray-900'
                : 'text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {filteredCategories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No items found.</p>
        ) : (
          filteredCategories.map((cat) => (
            <div key={cat.id} className="mt-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{cat.name}</p>
              <div className="grid grid-cols-2 gap-3">
                {cat.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!holdFailed) {
                        setSelectedItem(item);
                        setKitchenNotes('');
                      }
                    }}
                    disabled={holdFailed}
                    className={`bg-white border border-gray-200 rounded-xl p-3 text-left transition-colors ${holdFailed ? 'opacity-40 cursor-not-allowed' : 'hover:border-gray-400'}`}
                  >
                    {item.imageUrl ? (
                      <div className="w-full h-24 rounded-lg bg-gray-100 overflow-hidden mb-2">
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-full h-24 rounded-lg bg-gray-100 mb-2" />
                    )}
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">${item.price}</p>
                    {item.allergens.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.allergens.slice(0, 3).map((a) => (
                          <span
                            key={a}
                            className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="mt-8" ref={tabRef}>
          {activeOrders.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No items yet. Browse the menu above.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {activeOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-900">
                      {order.quantity > 1 && <span className="font-semibold">{order.quantity}x </span>}
                      {order.menuItemName}
                    </p>
                    {order.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{order.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ORDER_STATUS_STYLES[order.status] ?? ORDER_STATUS_STYLES.PENDING}`}
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      ${new Decimal(order.unitPrice).times(order.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeOrders.length > 0 && (
            <div className="mt-3 bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  {sessionRow.restaurantName} Tax ({new Decimal(sessionRow.taxRate).times(100).toFixed(0)}%)
                </span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>WalkOut Service Fee ({feePercentLabel}%)</span>
                <span>${serviceFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-gray-900 pt-1.5 border-t border-gray-100">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Need something?</p>

          {activeRequests.map((req) => (
            <div key={req.id} className="mb-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700 font-medium">{SERVICE_REQUEST_LABELS[req.type]}</p>
              <p className="text-xs text-blue-500 mt-0.5">{SERVICE_STATUS_LABELS[req.status]}</p>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {QUICK_REQUESTS.map((type) => (
              <button
                key={type}
                type="button"
                disabled={sendingRequest === type}
                onClick={() => void sendServiceRequest(type)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {sendingRequest === type ? 'Sending...' : SERVICE_REQUEST_LABELS[type]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMoreRequests((v) => !v)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              More...
            </button>
          </div>

          {showMoreRequests && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(SERVICE_REQUEST_LABELS) as ServiceRequestType[])
                .filter((t) => !QUICK_REQUESTS.includes(t))
                .map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={sendingRequest === type}
                    onClick={() => void sendServiceRequest(type)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {sendingRequest === type ? 'Sending...' : SERVICE_REQUEST_LABELS[type]}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
          </PhoneFrame>
        </div>
      </div>

      {sessionRow.status === 'OPEN' && !holdFailed && sessionId && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 pb-safe">
          <Link
            href={`/tab/${sessionId}/pay`}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Ready to leave
          </Link>
        </div>
      )}

      {isIdle && <IdleWarningToast onDismiss={resetIdle} />}

      {requestToast && !isIdle && (
        <div className="fixed bottom-6 left-4 right-4 z-50 bg-gray-900 text-white text-xs rounded-xl px-4 py-3 text-center shadow-lg">
          {requestToast}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setSelectedItem(null);
              setKitchenNotes('');
            }}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto">
            {selectedItem.imageUrl ? (
              <div className="w-full h-40 rounded-xl bg-gray-100 overflow-hidden mb-4">
                <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-full h-40 rounded-xl bg-gray-100 mb-4" />
            )}

            <div className="flex items-start justify-between mb-1">
              <h2 className="text-base font-bold text-gray-900">{selectedItem.name}</h2>
              <span className="text-base font-semibold text-gray-900 ml-2 shrink-0">${selectedItem.price}</span>
            </div>

            {selectedItem.description && (
              <p className="text-sm text-gray-500 mb-3">{selectedItem.description}</p>
            )}

            {selectedItem.allergens.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {selectedItem.allergens.map((a) => (
                  <span
                    key={a}
                    className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full"
                  >
                    Contains: {a}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="kitchen-notes" className="block text-xs font-medium text-gray-700 mb-1">
                Notes for the kitchen <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="kitchen-notes"
                type="text"
                maxLength={200}
                placeholder="e.g. no onions, well done"
                value={kitchenNotes}
                onChange={(e) => setKitchenNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleAddToTab()}
              disabled={addingItem || holdFailed}
              className="w-full bg-black text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {addingItem
                ? 'Adding...'
                : holdFailed
                  ? 'Card required before ordering'
                  : `Add to tab — $${selectedItem.price}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function TabPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading your tab...</p>
        </div>
      }
    >
      <TabPageInner />
    </Suspense>
  );
}
