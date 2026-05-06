'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Decimal from 'decimal.js';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useIdleWarning } from '@/hooks/useIdleWarning';
import IdleWarningToast from '@/components/IdleWarningToast';

// ---------------------------------------------------------------------------
// Types — mirrors API response shape (wire to /api/sessions/[sessionId] once
// Michael ships the Zod schema in src/lib/schemas/session.ts)
// ---------------------------------------------------------------------------

type Allergen = string;

type MenuItemData = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  allergens: Allergen[];
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
  status: 'PENDING' | 'CONFIRMED' | 'PREPPING' | 'SERVED' | 'CANCELLED';
};

type ServiceRequestData = {
  id: string;
  type: ServiceRequestType;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
};

type SessionData = {
  id: string;
  tableNumber: string;
  restaurantName: string;
  taxRate: string;
  walkOutServiceFeePercent: string;
  participantId: string;
  displayName: string;
  holdStatus: string;
  orders: OrderItemData[];
  serviceRequests: ServiceRequestData[];
  categories: MenuCategoryData[];
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

const QUICK_REQUESTS: ServiceRequestType[] = [
  'WATER',
  'SILVERWARE',
  'TOGO_CONTAINER',
  'REFILL',
];

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PREPPING: 'Preparing',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border-blue-200',
  PREPPING: 'bg-orange-50 text-orange-700 border-orange-200',
  SERVED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-100 text-gray-400 border-gray-200',
};

const SERVICE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Sent — your server is on the way',
  ACKNOWLEDGED: 'Your server is coming',
  RESOLVED: 'Done',
  CANCELLED: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Mock data — remove when wiring to real API
// TODO: replace with fetch('/api/sessions/${sessionId}') once Michael ships
//       src/lib/schemas/session.ts
// ---------------------------------------------------------------------------
function getMockSession(sessionId: string): SessionData {
  return {
    id: sessionId,
    tableNumber: '7',
    restaurantName: 'Brew & Blade',
    taxRate: '0.0600',
    walkOutServiceFeePercent: '0.0050',
    participantId: 'mock-participant-1',
    displayName: 'Alex',
    holdStatus: 'HELD',
    orders: [],
    serviceRequests: [],
    categories: [
      {
        id: 'cat-1',
        name: 'Starters',
        items: [
          {
            id: 'item-1',
            name: 'Lobster Bisque',
            description: 'Rich, creamy bisque with sherry and fresh chives.',
            price: '12.00',
            imageUrl: null,
            allergens: ['shellfish', 'dairy', 'gluten'],
            isPopular: true,
            isAvailable: true,
            categoryId: 'cat-1',
          },
          {
            id: 'item-2',
            name: 'Caesar Salad',
            description: 'Romaine, house-made caesar dressing, shaved parmesan, croutons.',
            price: '11.00',
            imageUrl: null,
            allergens: ['dairy', 'gluten', 'egg'],
            isPopular: false,
            isAvailable: true,
            categoryId: 'cat-1',
          },
        ],
      },
      {
        id: 'cat-2',
        name: 'Mains',
        items: [
          {
            id: 'item-3',
            name: 'Cheeseburger',
            description: 'House-ground chuck, aged cheddar, pickles, brioche bun. Served with fries.',
            price: '14.00',
            imageUrl: null,
            allergens: ['dairy', 'gluten'],
            isPopular: true,
            isAvailable: true,
            categoryId: 'cat-2',
          },
          {
            id: 'item-4',
            name: 'Ribeye Steak',
            description: '12 oz prime ribeye, truffle butter, roasted garlic mashed potatoes.',
            price: '44.00',
            imageUrl: null,
            allergens: ['dairy'],
            isPopular: true,
            isAvailable: true,
            categoryId: 'cat-2',
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TabPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionData | null>(null);
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

  useHeartbeat(sessionId ?? null, session?.participantId ?? null);
  const { isIdle, resetIdle } = useIdleWarning();

  const holdFailed = session?.holdStatus === 'FAILED';

  useEffect(() => {
    const dismissed = localStorage.getItem('walkout_banner_dismissed');
    if (!dismissed) setBannerDismissed(false);

    // TODO: replace with real API fetch once Michael ships src/lib/schemas/session.ts
    setSession(getMockSession(sessionId));
  }, [sessionId]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading your tab...</p>
      </div>
    );
  }

  const allItems = session.categories.flatMap((c) => c.items);
  const popularItems = allItems.filter((i) => i.isPopular && i.isAvailable);

  const filteredCategories = session.categories.map((cat) => ({
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

  const activeOrders = session.orders.filter((o) => o.status !== 'CANCELLED');
  const subtotal = activeOrders.reduce(
    (sum, o) => sum.plus(new Decimal(o.unitPrice).times(o.quantity)),
    new Decimal(0)
  );
  const tax = activeOrders.reduce(
    (sum, o) => sum.plus(new Decimal(o.taxAmount).times(o.quantity)),
    new Decimal(0)
  );
  const serviceFee = subtotal.times(new Decimal(session.walkOutServiceFeePercent));
  const total = subtotal.plus(tax).plus(serviceFee);

  const activeRequests = session.serviceRequests.filter(
    (r) => r.status === 'OPEN' || r.status === 'ACKNOWLEDGED'
  );

  function dismissBanner() {
    localStorage.setItem('walkout_banner_dismissed', '1');
    setBannerDismissed(true);
  }

  async function handleAddToTab() {
    if (!selectedItem) return;
    setAddingItem(true);
    // TODO: POST /api/sessions/[sessionId]/orders once Michael ships the endpoint
    await new Promise((r) => setTimeout(r, 500));
    setAddingItem(false);
    setSelectedItem(null);
    setKitchenNotes('');
  }

  async function sendServiceRequest(type: ServiceRequestType) {
    setSendingRequest(type);
    // TODO: POST /api/sessions/[sessionId]/service-requests once Michael ships the endpoint
    await new Promise((r) => setTimeout(r, 400));
    setSendingRequest(null);
    setShowMoreRequests(false);

    if (toastTimer.current) clearTimeout(toastTimer.current);
    setRequestToast(`${SERVICE_REQUEST_LABELS[type]} — request sent. Your server will be right with you.`);
    toastTimer.current = setTimeout(() => setRequestToast(''), 4000);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Nav bar */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-14">
        <div>
          <p className="text-sm font-bold text-gray-900">{session.restaurantName}</p>
          <p className="text-xs text-gray-400">Table {session.tableNumber}</p>
        </div>
        <button
          onClick={() => setShowSearch((v) => !v)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          aria-label="Search menu"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </button>
      </header>

      {/* Search bar */}
      {showSearch && (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <input
            autoFocus
            type="text"
            placeholder="Search menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      )}

      {/* How WalkOut Works banner */}
      {!bannerDismissed && (
        <div className="mx-4 mt-4 bg-gray-900 text-white rounded-xl p-4">
          <p className="text-sm font-semibold mb-1">How WalkOut Works</p>
          <ol className="text-xs text-gray-300 space-y-1 list-decimal list-inside">
            <li>Order right from this page</li>
            <li>Eat without thinking about the check</li>
            <li>Just leave — we&apos;ll charge your card and send your receipt</li>
          </ol>
          <button
            onClick={dismissBanner}
            className="mt-3 text-xs text-gray-400 hover:text-white underline"
          >
            Got it, thanks
          </button>
        </div>
      )}

      {/* Hold-failed blocking banner — sticky so it stays visible while scrolling */}
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

      {/* Hold active confirmation */}
      {session.holdStatus === 'HELD' && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xs text-green-700">
            Your card is on hold. You&apos;ll only be charged for what you order.
          </p>
        </div>
      )}

      <div className="px-4">
        {/* Featured items */}
        {popularItems.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Featured
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              {popularItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setSelectedItem(item); setKitchenNotes(''); }}
                  className="shrink-0 w-36 bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-gray-400 transition-colors"
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

        {/* Category filter pills */}
        <div className="flex gap-2 mt-6 overflow-x-auto pb-1 -mx-4 px-4">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedCategory === null
                ? 'bg-gray-900 text-white border-gray-900'
                : 'text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            All
          </button>
          {session.categories.map((cat) => (
            <button
              key={cat.id}
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

        {/* Menu grid */}
        {filteredCategories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No items found.</p>
        ) : (
          filteredCategories.map((cat) => (
            <div key={cat.id} className="mt-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {cat.name}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {cat.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { if (!holdFailed) { setSelectedItem(item); setKitchenNotes(''); } }}
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
                          <span key={a} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
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

        {/* My Tab */}
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">My Tab</p>
          {activeOrders.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No items yet. Browse the menu above.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {activeOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-900">
                      {order.quantity > 1 && (
                        <span className="font-semibold">{order.quantity}x </span>
                      )}
                      {order.menuItemName}
                    </p>
                    {order.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">{order.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ORDER_STATUS_STYLES[order.status]}`}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-xs text-gray-500">
                      ${new Decimal(order.unitPrice).times(order.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Running total */}
          {activeOrders.length > 0 && (
            <div className="mt-3 bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  {session.restaurantName} Tax ({new Decimal(session.taxRate).times(100).toFixed(0)}%)
                </span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>WalkOut Service Fee (0.5%)</span>
                <span>${serviceFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-gray-900 pt-1.5 border-t border-gray-100">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Service Requests */}
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Need something?
          </p>

          {/* Active requests status */}
          {activeRequests.map((req) => (
            <div key={req.id} className="mb-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700 font-medium">
                {SERVICE_REQUEST_LABELS[req.type]}
              </p>
              <p className="text-xs text-blue-500 mt-0.5">{SERVICE_STATUS_LABELS[req.status]}</p>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {QUICK_REQUESTS.map((type) => (
              <button
                key={type}
                disabled={sendingRequest === type}
                onClick={() => sendServiceRequest(type)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {sendingRequest === type ? 'Sending...' : SERVICE_REQUEST_LABELS[type]}
              </button>
            ))}
            <button
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
                    disabled={sendingRequest === type}
                    onClick={() => sendServiceRequest(type)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {sendingRequest === type ? 'Sending...' : SERVICE_REQUEST_LABELS[type]}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Idle warning toast */}
      {isIdle && <IdleWarningToast onDismiss={resetIdle} />}

      {/* Request sent toast */}
      {requestToast && !isIdle && (
        <div className="fixed bottom-6 left-4 right-4 z-50 bg-gray-900 text-white text-xs rounded-xl px-4 py-3 text-center shadow-lg">
          {requestToast}
        </div>
      )}

      {/* Item detail modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setSelectedItem(null); setKitchenNotes(''); }}
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
              <span className="text-base font-semibold text-gray-900 ml-2 shrink-0">
                ${selectedItem.price}
              </span>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notes for the kitchen{' '}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder="e.g. no onions, well done"
                value={kitchenNotes}
                onChange={(e) => setKitchenNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <button
              onClick={handleAddToTab}
              disabled={addingItem || session.holdStatus === 'FAILED'}
              className="w-full bg-black text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {addingItem
                ? 'Adding...'
                : session.holdStatus === 'FAILED'
                ? 'Card required before ordering'
                : `Add to tab — $${selectedItem.price}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
