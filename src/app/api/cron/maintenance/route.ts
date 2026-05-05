import { NextResponse } from 'next/server';

// ================================================================
// /api/cron/maintenance — single Vercel Cron job, every 5 minutes
// Secured by Authorization: Bearer ${CRON_SECRET}
// ================================================================

// Phase 3: advance OPEN→AWAITING_TIP on idle; AWAITING_TIP→CAPTURING at 15-min timeout
async function processDepartures(): Promise<void> {
  // TODO Phase 3
}

// Phase 3+4: re-authorise expiring holds; clean up CLOSED sessions (3:00–3:05 AM ET only)
async function cleanupSessions(): Promise<void> {
  const now = new Date();
  // DST-aware window: run only between 03:00 and 03:05 America/New_York
  const hourET = Number(
    now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })
  );
  const minuteET = Number(
    now.toLocaleString('en-US', { minute: 'numeric', timeZone: 'America/New_York' })
  );
  if (hourET !== 3 || minuteET > 5) return;
  // TODO Phase 3
}

// Phase 6 / v2: Gemini-powered weekly purchase order generation
async function generateWeeklyForecasts(): Promise<void> {
  // TODO v2
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await processDepartures();
    await cleanupSessions();
    await generateWeeklyForecasts();
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[cron/maintenance]', err);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
