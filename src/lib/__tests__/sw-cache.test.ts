import { describe, expect, it } from 'vitest';
import {
  isCacheableImagePath,
  isRestaurantMenuGet,
  shouldBypassCachePathname,
} from '@/lib/sw-cache';

describe('sw-cache helpers', () => {
  it('bypasses sensitive API prefixes', () => {
    expect(shouldBypassCachePathname('/api/sessions/x')).toBe(true);
    expect(shouldBypassCachePathname('/api/diner/me')).toBe(true);
    expect(shouldBypassCachePathname('/api/restaurant/tables')).toBe(true);
    expect(shouldBypassCachePathname('/api/auth/login')).toBe(true);
    expect(shouldBypassCachePathname('/api/webhooks/stripe')).toBe(true);
    expect(shouldBypassCachePathname('/api/restaurants/abc/menu')).toBe(false);
  });

  it('detects public menu GET', () => {
    expect(isRestaurantMenuGet('/api/restaurants/550e8400-e29b-41d4-a716-446655440000/menu', 'GET')).toBe(true);
    expect(isRestaurantMenuGet('/api/restaurants/550e8400-e29b-41d4-a716-446655440000/menu/', 'GET')).toBe(true);
    expect(isRestaurantMenuGet('/api/restaurants/x/menu', 'POST')).toBe(false);
  });

  it('detects image-like paths', () => {
    expect(isCacheableImagePath('/_next/image')).toBe(true);
    expect(isCacheableImagePath('/foo/bar.jpg')).toBe(true);
    expect(isCacheableImagePath('/api/x')).toBe(false);
  });
});
