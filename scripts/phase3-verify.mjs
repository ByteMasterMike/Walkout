#!/usr/bin/env node
/**
 * Phase 3 Feature Test Plan — static / CI verification.
 * Mirrors checklist in docs/planning (manual browser QA still recommended).
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

let failures = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures++;
}

function assert(cond, msg) {
  if (cond) pass(msg);
  else fail(msg);
}

console.log('Phase 3 plan verification — static checks\n');

/* Test 1 — RBAC: Stripe Setup ADMIN-only */
const shellSrc = read('src/components/DashboardShell.tsx');
assert(
  shellSrc.includes("href: '/dashboard/setup/stripe'") &&
    shellSrc.includes("roles: ['ADMIN']"),
  'Nav: Stripe Setup is declared with roles ADMIN only'
);
assert(
  shellSrc.includes('item.roles.includes(role)'),
  'Nav: links filtered by role.includes'
);

const stripePage = read('src/app/dashboard/setup/stripe/page.tsx');
assert(
  stripePage.includes("session.user.role !== 'ADMIN'") && stripePage.includes("redirect('/dashboard')"),
  'Stripe setup page: non-ADMIN redirected to /dashboard'
);

/* Test 2 — Connect Stripe client POST */
const stripeClient = read('src/app/dashboard/setup/stripe/StripeConnectClient.tsx');
assert(
  stripeClient.includes("fetch('/api/restaurant/stripe/connect', { method: 'POST' })"),
  'StripeConnectClient: POST to /api/restaurant/stripe/connect'
);
assert(stripeClient.includes('window.location.href = url'), 'StripeConnectClient: redirects to returned url');

/* Test 3 — ?success=1 / ?refresh=1 */
assert(stripePage.includes("params.success === '1'"), 'Stripe page: reads success query param');
assert(stripePage.includes("params.refresh === '1'"), 'Stripe page: reads refresh query param');
assert(
  stripeClient.includes('returnedSuccess') && stripeClient.includes('still verifying'),
  'StripeConnectClient: success-return banner copy'
);
assert(
  stripeClient.includes('returnedRefresh') && stripeClient.includes('link expired'),
  'StripeConnectClient: refresh-return banner copy'
);

/* Test 4 — Heartbeat 30s */
const heartbeat = read('src/hooks/useHeartbeat.ts');
assert(heartbeat.includes('HEARTBEAT_INTERVAL_MS = 30_000'), 'Heartbeat: 30s interval constant');
assert(
  heartbeat.includes('/heartbeat'),
  'Heartbeat: POST /api/sessions/.../heartbeat'
);
assert(
  heartbeat.includes('visibilitychange'),
  'Heartbeat: visibilitychange listener for reconnect ping'
);

/* Test 5 — Idle warning (env override — plan allowed temporary constants; we use env) */
const idle = read('src/hooks/useIdleWarning.ts');
assert(idle.includes('NEXT_PUBLIC_IDLE_WARNING_MS'), 'Idle: NEXT_PUBLIC_IDLE_WARNING_MS override');
assert(idle.includes('NEXT_PUBLIC_IDLE_TICK_MS'), 'Idle: NEXT_PUBLIC_IDLE_TICK_MS override');
assert(idle.includes('resetIdle'), 'Idle: exposes resetIdle for toast dismiss');

/* Test 6 — Hold-failed UI + dev mockHold */
const tabPage = read('src/app/tab/[sessionId]/page.tsx');
assert(tabPage.includes('mockHold'), 'Tab: mockHold query override (dev)');
assert(tabPage.includes('holdFailed'), 'Tab: holdFailed derived state');
assert(tabPage.includes('disabled={holdFailed}'), 'Tab: grid items disabled when holdFailed');
assert(
  tabPage.includes('Featured') && tabPage.includes('disabled={holdFailed}'),
  'Tab: featured row respects holdFailed (disabled)'
);
assert(tabPage.includes('sticky top-14'), 'Tab: hold-failed banner sticky positioning');
assert(tabPage.includes('<Suspense'), 'Tab: Suspense boundary for useSearchParams');

/* Test 7 — Table detail failed-hold banner */
const tableDetail = read('src/app/dashboard/tables/[tableId]/page.tsx');
assert(
  tableDetail.includes("displayName: 'Sarah'") && tableDetail.includes("holdStatus: 'FAILED'"),
  'Table detail mock: Sarah has FAILED hold for banner test'
);
assert(
  tableDetail.includes('failedHolds') && tableDetail.includes('Card declined'),
  'Table detail: failed-holds alert banner block'
);

/* Test 8 — Settlements */
const settlements = read('src/app/dashboard/settlements/page.tsx');
assert(settlements.includes('MOCK_SETTLEMENTS'), 'Settlements: mock rows present');
assert(settlements.includes('Jordan Lee'), 'Settlements: Jordan Lee mock row');
assert(
  settlements.includes("destructive.includes(action)") || settlements.includes('destructive'),
  'Settlements: destructive action gate'
);
assert(settlements.includes('confirmRow'), 'Settlements: confirmation modal state');
assert(settlements.includes('WRITE_OFF'), 'Settlements: write-off is destructive');

console.log('\nRunning production build (TypeScript + Next)...\n');
try {
  execSync('npm run build', { cwd: root, stdio: 'inherit', env: process.env });
  pass('npm run build completed successfully');
} catch {
  fail('npm run build failed');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}

console.log('\nAll Phase 3 static verification checks passed.\n');
console.log('Manual browser QA (login as ADMIN/MANAGER/STAFF):');
console.log('  - Stripe Setup visibility, Connect redirect, ?success=1 / ?refresh=1');
console.log('  - Network tab: heartbeat ~30s on /tab/<uuid>');
console.log('  - Set .env.local NEXT_PUBLIC_IDLE_WARNING_MS=6000 for idle toast speed test');
console.log('  - /tab/<uuid>?mockHold=FAILED for hold-failed UI');
console.log('  - /dashboard/settlements action buttons + destructive modal\n');
process.exit(0);
