import type { ErrorEvent } from '@sentry/nextjs';

const SENSITIVE_KEY = /password|secret|token|stripeCustomerId|stripePaymentMethodId/i;

/** Query params that often carry secrets in OAuth / magic links / invite flows */
const SENSITIVE_QUERY_PARAMS =
  /^(token|code|state|tipPromptToken|inviteToken|session_token|access_token|refresh_token)$/i;

function scrubObject(obj: unknown, depth = 0): void {
  if (depth > 8 || obj === null || obj === undefined) return;
  if (typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (typeof v === 'object' && v !== null) scrubObject(v, depth + 1);
    }
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SENSITIVE_KEY.test(key)) {
      record[key] = '[Filtered]';
      continue;
    }
    const v = record[key];
    if (typeof v === 'object' && v !== null) scrubObject(v, depth + 1);
  }
}

function scrubRequestUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAMS.test(key)) {
        u.searchParams.set(key, '[Filtered]');
      }
    }
    return u.toString();
  } catch {
    return '[Invalid URL]';
  }
}

/** PII / secret scrubber for Sentry `beforeSend` (Phase 6). */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request?.headers && typeof event.request.headers === 'object') {
    const h = event.request.headers as Record<string, unknown>;
    delete h.authorization;
    delete h.Authorization;
    delete h.cookie;
    delete h.Cookie;
  }
  if (event.request && 'cookies' in event.request) {
    (event.request as { cookies?: unknown }).cookies = undefined;
  }
  if (event.request && typeof event.request === 'object') {
    const req = event.request as { url?: string };
    if (req.url !== undefined) {
      req.url = scrubRequestUrl(req.url);
    }
  }

  delete (event as { user?: unknown }).user;

  if (event.tags && typeof event.tags === 'object') {
    scrubObject(event.tags);
  }

  const crumbs = event.breadcrumbs;
  if (Array.isArray(crumbs)) {
    for (const crumb of crumbs) {
      if (crumb && typeof crumb === 'object' && 'data' in crumb && crumb.data !== undefined) {
        scrubObject(crumb.data);
      }
    }
  }

  scrubObject(event.extra);
  scrubObject(event.contexts);
  scrubObject(event.breadcrumbs);
  return event;
}
