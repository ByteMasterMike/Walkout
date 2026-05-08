/**
 * Pure helpers mirrored from `public/sw.js` for unit tests.
 * Keep SW script minimal — logic stays in sync with these exports.
 */

export function shouldBypassCachePathname(pathname: string): boolean {
  return (
    pathname.startsWith('/api/sessions/') ||
    pathname.startsWith('/api/diner/') ||
    pathname.startsWith('/api/restaurant/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/webhooks/')
  );
}

/** GET /api/restaurants/:uuid/menu (public menu read). */
export function isRestaurantMenuGet(pathname: string, method: string): boolean {
  if (method !== 'GET') return false;
  return /^\/api\/restaurants\/[^/]+\/menu\/?$/.test(pathname);
}

export function isCacheableImagePath(pathname: string): boolean {
  if (pathname.startsWith('/_next/image')) return true;
  return /\.(png|jpe?g|webp|gif|svg|ico|avif)(\?.*)?$/i.test(pathname);
}
