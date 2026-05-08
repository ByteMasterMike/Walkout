import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

let warnedNoRedis = false;
let warnedFailOpen = false;
let cashRatelimit: Ratelimit | null | undefined;
let cloudprintRatelimit: Ratelimit | null | undefined;
let signupMigrateRatelimit: Ratelimit | null | undefined;
let writeRatelimit: Ratelimit | null | undefined;
let joinRatelimit: Ratelimit | null | undefined;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedNoRedis) {
      warnedNoRedis = true;
      if (process.env.NODE_ENV === 'development') {
        console.info('[rate-limit] UPSTASH_REDIS_REST_URL / TOKEN unset — rate limiting disabled');
      }
    }
    return null;
  }
  return new Redis({ url, token });
}

/** Used for Phase 6 fail-closed when Redis is required for anon POST limits. */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function redisMissingProductionResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Service temporarily unavailable' },
    { status: 503, headers: { 'Retry-After': '60' } },
  );
}

/**
 * In production, anon POST rate limits require Redis. Without it, return 503 unless
 * `RATE_LIMIT_FAIL_OPEN=1` (emergency rollback; logged once).
 */
function enforceProductionRedisOrFailOpen(): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null;
  if (isRedisConfigured()) return null;
  if (process.env.RATE_LIMIT_FAIL_OPEN === '1') {
    if (!warnedFailOpen) {
      warnedFailOpen = true;
      console.warn('[rate-limit] RATE_LIMIT_FAIL_OPEN=1 — anon POST limits bypassed in production (no Redis)');
    }
    return null;
  }
  return redisMissingProductionResponse();
}

function getCashLimiter(): Ratelimit | null {
  if (cashRatelimit !== undefined) return cashRatelimit;
  const redis = getRedis();
  if (!redis) {
    cashRatelimit = null;
    return null;
  }
  cashRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'walkout:cash',
  });
  return cashRatelimit;
}

function getSignupMigrateLimiter(): Ratelimit | null {
  if (signupMigrateRatelimit !== undefined) return signupMigrateRatelimit;
  const redis = getRedis();
  if (!redis) {
    signupMigrateRatelimit = null;
    return null;
  }
  signupMigrateRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    prefix: 'walkout:signup',
  });
  return signupMigrateRatelimit;
}

/** Client IP for abuse controls (best-effort behind proxies). */
export function getRequestIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Rate limit diner signup + migrate-from-guest per IP. Returns 429 response when limited. */
export async function enforceSignupMigrateLimit(request: Request): Promise<NextResponse | null> {
  const lim = getSignupMigrateLimiter();
  if (!lim) return null;
  const ip = getRequestIp(request);
  const { success } = await lim.limit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null;
}

function getCloudprintLimiter(): Ratelimit | null {
  if (cloudprintRatelimit !== undefined) return cloudprintRatelimit;
  const redis = getRedis();
  if (!redis) {
    cloudprintRatelimit = null;
    return null;
  }
  cloudprintRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'),
    prefix: 'walkout:cprt',
  });
  return cloudprintRatelimit;
}

/** Returns 429 NextResponse when limited; null when allowed or rate limit disabled. */
export async function enforceCashLimit(participantId: string): Promise<NextResponse | null> {
  const lim = getCashLimiter();
  if (!lim) return null;
  const { success } = await lim.limit(participantId);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null;
}

export async function enforceCloudprintLimit(deviceId: string, ip: string): Promise<NextResponse | null> {
  const lim = getCloudprintLimiter();
  if (!lim) return null;
  const key = `${deviceId}:${ip || 'unknown'}`;
  const { success } = await lim.limit(key);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null;
}

/** PRD §25.8-style limit for POST /api/join/* (session bootstrap). */
export function getJoinLimiter(): Ratelimit | null {
  if (joinRatelimit !== undefined) return joinRatelimit;
  const redis = getRedis();
  if (!redis) {
    joinRatelimit = null;
    return null;
  }
  joinRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'walkout:join',
  });
  return joinRatelimit;
}

/** Baseline per-IP limit for POST /api/sessions/* (tab mutations). */
export function getWriteLimiter(): Ratelimit | null {
  if (writeRatelimit !== undefined) return writeRatelimit;
  const redis = getRedis();
  if (!redis) {
    writeRatelimit = null;
    return null;
  }
  writeRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'),
    prefix: 'walkout:write',
  });
  return writeRatelimit;
}

/** POST /api/join/* — 10/min per IP when Redis configured; production fails closed without Redis. */
export async function enforceJoinLimit(request: Request): Promise<NextResponse | null> {
  const fail = enforceProductionRedisOrFailOpen();
  if (fail) return fail;

  const lim = getJoinLimiter();
  if (!lim) return null;
  const ip = getRequestIp(request);
  const { success } = await lim.limit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null;
}

/** POST /api/sessions/* — 60/min per IP when Redis configured; production fails closed without Redis. */
export async function enforceWriteLimit(request: Request): Promise<NextResponse | null> {
  const fail = enforceProductionRedisOrFailOpen();
  if (fail) return fail;

  const lim = getWriteLimiter();
  if (!lim) return null;
  const ip = getRequestIp(request);
  const { success } = await lim.limit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null;
}
