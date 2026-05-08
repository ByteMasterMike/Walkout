#!/usr/bin/env node
/**
 * Phase 6 load test — fires concurrent GET requests (SSE/stream endpoints stay open).
 *
 * Usage:
 *   BASE_URL=https://staging.example.com SESSION_ID=<uuid> COOKIE='tabs_anon=...' node scripts/loadtest.mjs
 *
 * Requires Node 18+. Uses undici `fetch`. Tune CONNECTIONS (default 20) and DURATION_MS.
 *
 * Pass criterion (runbook): <1% errors, p95 first-byte latency <500ms (measure with your observability stack).
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SESSION_ID = process.env.SESSION_ID || '';
const CONNECTIONS = Number(process.env.CONNECTIONS || 20);
const DURATION_MS = Number(process.env.DURATION_MS || 30_000);
const PATH =
  process.env.STREAM_PATH ||
  (SESSION_ID ? `/api/sessions/${SESSION_ID}/stream` : '/api/restaurant/stream');

const cookie = process.env.COOKIE || '';

const headers = {
  Accept: 'text/event-stream',
};
if (cookie) {
  headers.Cookie = cookie;
}

async function oneStream(i) {
  const url = new URL(PATH, BASE_URL);
  if (!SESSION_ID && PATH.includes('restaurant/stream') && process.env.RESTAURANT_ID) {
    url.searchParams.set('restaurantId', process.env.RESTAURANT_ID);
  }
  const start = performance.now();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), DURATION_MS);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    const ttfb = performance.now() - start;
    if (!res.ok || !res.body) {
      return { i, ok: false, status: res.status, ttfb };
    }
    const reader = res.body.getReader();
    let chunks = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks += value?.length ?? 0;
      if (chunks > 64) break;
    }
    return { i, ok: true, status: res.status, ttfb, chunks };
  } catch (e) {
    return { i, ok: false, error: String(e), ttfb: performance.now() - start };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.error(`Loadtest → ${new URL(PATH, BASE_URL)} (${CONNECTIONS} concurrent, ${DURATION_MS}ms abort/first-chunk)`);

  const results = [];
  const deadline = Date.now() + DURATION_MS;

  while (Date.now() < deadline) {
    const batch = [];
    for (let c = 0; c < CONNECTIONS; c++) {
      batch.push(oneStream(c));
    }
    const out = await Promise.all(batch);
    results.push(...out);
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(JSON.stringify({ samples: results.length, ok, fail, rate: fail / results.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
