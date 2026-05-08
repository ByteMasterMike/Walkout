/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'walkout-v1';

function shouldBypassCachePathname(pathname) {
  return (
    pathname.startsWith('/api/sessions/') ||
    pathname.startsWith('/api/diner/') ||
    pathname.startsWith('/api/restaurant/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/webhooks/')
  );
}

function isRestaurantMenuGet(pathname, method) {
  if (method !== 'GET') return false;
  return /^\/api\/restaurants\/[^/]+\/menu\/?$/.test(pathname);
}

function isCacheableImagePath(pathname) {
  if (pathname.startsWith('/_next/image')) return true;
  return /\.(png|jpe?g|webp|gif|svg|ico|avif)(\?.*)?$/i.test(pathname);
}

async function staleWhileRevalidate(event, request, cache) {
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  const net = await networkPromise;
  if (net) return net;
  return Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;

  if (shouldBypassCachePathname(pathname)) return;

  if (!isRestaurantMenuGet(pathname, req.method) && !isCacheableImagePath(pathname)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => staleWhileRevalidate(event, req, cache)),
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'WalkOut', body: '', url: '/' };
  try {
    if (event.data) {
      data = { ...data, ...JSON.parse(event.data.text()) };
    }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url || '/' },
      icon: '/favicon.ico',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || '/';
  let target = '/';
  try {
    const parsed = new URL(raw, self.location.origin);
    if (parsed.origin === self.location.origin) {
      target = parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    /* keep '/' */
  }
  event.waitUntil(self.clients.openWindow(target));
});
