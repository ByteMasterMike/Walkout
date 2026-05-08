import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

describe('scrubSentryEvent', () => {
  it('strips authorization and cookie headers', () => {
    const event = {
      request: {
        headers: {
          authorization: 'Bearer x',
          Cookie: 'a=b',
          'content-type': 'application/json',
        },
      },
    } as unknown as ErrorEvent;

    scrubSentryEvent(event);

    const h = event.request!.headers as Record<string, unknown>;
    expect(h.authorization).toBeUndefined();
    expect(h.Cookie).toBeUndefined();
    expect(h['content-type']).toBe('application/json');
  });

  it('redacts sensitive query params on request.url', () => {
    const event = {
      request: {
        url: 'https://example.com/callback?token=secret123&foo=bar',
        headers: {},
      },
    } as unknown as ErrorEvent;

    scrubSentryEvent(event);

    const url = (event.request as { url?: string }).url ?? '';
    expect(url).not.toContain('secret123');
    expect(decodeURIComponent(url)).toContain('[Filtered]');
    expect(url).toContain('foo=bar');
  });

  it('clears event.user', () => {
    const event = {
      user: { id: 'u1', email: 'a@b.com' },
      request: { headers: {} },
    } as unknown as ErrorEvent;

    scrubSentryEvent(event);

    expect(event.user).toBeUndefined();
  });

  it('scrubs breadcrumb data by sensitive keys', () => {
    const event = {
      breadcrumbs: [{ type: 'http', data: { password: 'x', path: '/ok' } }],
      request: { headers: {} },
    } as unknown as ErrorEvent;

    scrubSentryEvent(event);

    const data = (event.breadcrumbs![0] as { data: Record<string, unknown> }).data;
    expect(data.password).toBe('[Filtered]');
    expect(data.path).toBe('/ok');
  });
});
