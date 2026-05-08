import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

let warnedNoRedis = false;
let cashRatelimit: Ratelimit | null | undefined;
let cloudprintRatelimit: Ratelimit | null | undefined;
let signupMigrateRatelimit: Ratelimit | null | undefined;

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
