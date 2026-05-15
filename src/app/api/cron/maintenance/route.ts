import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import { DepartureSource } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { captureParticipantTab, getTimeoutTipResolution } from '@/lib/payment/capture'
import { getStripe, STRIPE_PAYMENT_INTENT_CARD_ONLY } from '@/lib/stripe'
import { assignTipPromptTokensForSession } from '@/lib/tip/assignTipPromptTokens'
import { notifyTipWindowOpened } from '@/lib/notify/tipWindow'

// ================================================================
// /api/cron/maintenance — single Vercel Cron job, every 5 minutes
// Secured by Authorization: Bearer ${CRON_SECRET}
// ================================================================

const TIP_WINDOW_MS = 15 * 60_000
const FORCE_TIMEOUT_MS = 2 * 60 * 60_000
const REAUTH_AGE_MS = 6.5 * 24 * 60 * 60_000

/**
 * Pass 1: OPEN → AWAITING_TIP (idle heartbeat or 2h safety net)
 * Pass 2: tip window elapsed → CAPTURING + captureParticipantTab (20% default)
 */
async function processDepartures(): Promise<void> {
  const now = new Date()
  const nowMs = now.getTime()

  const openSessions = await prisma.tabSession.findMany({
    where: { status: 'OPEN' },
    include: { restaurant: true },
  })

  for (const s of openSessions) {
    const idleMs = s.restaurant.idleTimeoutMinutes * 60_000
    const effectiveActivity = s.lastHeartbeatAt ?? s.createdAt
    const idleDepart = effectiveActivity.getTime() < nowMs - idleMs
    const forceDepart = s.createdAt.getTime() < nowMs - FORCE_TIMEOUT_MS
    if (!idleDepart && !forceDepart) continue

    const departureSource: DepartureSource = forceDepart ? 'FORCE_TIMEOUT' : 'IDLE_TIMEOUT'

    await prisma.$transaction([
      prisma.tabSession.update({
        where: { id: s.id },
        data: { status: 'AWAITING_TIP', departureSource },
      }),
      prisma.tabParticipant.updateMany({
        where: { sessionId: s.id, captureStatus: 'PENDING' },
        data: { awaitingTipSince: now, departedAt: now },
      }),
    ])

    await assignTipPromptTokensForSession(s.id)

    const tipRecipients = await prisma.tabParticipant.findMany({
      where: { sessionId: s.id, tipPromptToken: { not: null } },
      select: { id: true },
    })
    for (const row of tipRecipients) {
      try {
        await notifyTipWindowOpened(row.id)
      } catch (err) {
        console.error('[cron/processDepartures] notifyTipWindowOpened', row.id, err)
      }
    }
  }

  // Pass 2 — 15-min tip timeout, session in tip state
  const due = await prisma.tabParticipant.findMany({
    where: {
      captureStatus: 'PENDING',
      holdStatus: 'HELD',
      departedAt: { not: null },
      awaitingTipSince: { not: null, lt: new Date(nowMs - TIP_WINDOW_MS) },
      session: {
        status: { in: ['AWAITING_TIP', 'CAPTURING', 'OPEN'] },
      },
    },
    include: {
      session: { include: { restaurant: true } },
      orders: true,
      diner: { select: { defaultTipBehavior: true } },
    },
  })

  for (const p of due) {
    const { restaurant } = p.session
    if (
      !p.stripePaymentIntentId ||
      p.holdAmount == null ||
      !p.stripeCustomerId ||
      !p.stripePaymentMethodId ||
      !restaurant.stripeConnectAccountId ||
      !restaurant.stripeConnectOnboarded
    ) {
      console.warn('[cron/processDepartures] skip participant — missing payment prerequisites', p.id)
      continue
    }

    const cas = await prisma.tabParticipant.updateMany({
      where: { id: p.id, captureStatus: 'PENDING' },
      data: { captureStatus: 'PROCESSING' },
    })
    if (cas.count === 0) continue

    const EXCLUDED = ['CANCELLED', 'CASH_PENDING'] as const
    const activeOrders = p.orders.filter((o) => !EXCLUDED.includes(o.status as (typeof EXCLUDED)[number]))
    const subtotalDecimal = activeOrders.reduce(
      (acc, o) => acc.plus(new Decimal(o.unitPrice.toString()).times(o.quantity)),
      new Decimal(0),
    )

    const tipResolution = getTimeoutTipResolution(
      subtotalDecimal,
      p.tipBehavior,
      p.diner?.defaultTipBehavior,
    )
    const tipCents = tipResolution.tipCents
    const resolvedTipSource = tipResolution.resolvedTipSource

    try {
      await captureParticipantTab({
        participantId: p.id,
        holdAmount: p.holdAmount,
        stripePaymentIntentId: p.stripePaymentIntentId,
        stripeCustomerId: p.stripeCustomerId,
        stripePaymentMethodId: p.stripePaymentMethodId,
        stripeConnectAccountId: restaurant.stripeConnectAccountId,
        resolvedTipAmountCents: tipCents,
        resolvedTipSource,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      console.error('[cron/processDepartures] capture failed', { participantId: p.id, message })
      await prisma.tabParticipant.updateMany({
        where: { id: p.id, captureStatus: 'PROCESSING' },
        data: { captureStatus: 'PENDING' },
      })
    }
  }
}

/**
 * 03:00–03:05 America/New_York only — refresh stale auth holds before expiry (PRD §11.7).
 */
async function cleanupSessions(): Promise<void> {
  const now = new Date()
  const hourET = Number(
    now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }),
  )
  const minuteET = Number(
    now.toLocaleString('en-US', { minute: 'numeric', timeZone: 'America/New_York' }),
  )
  if (hourET !== 3 || minuteET > 5) return

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[cron/cleanupSessions] STRIPE_SECRET_KEY missing — skipping reauth cleanup')
    return
  }

  const cutoff = new Date(now.getTime() - REAUTH_AGE_MS)
  const stripe = getStripe()

  const expiring = await prisma.tabParticipant.findMany({
    where: {
      holdStatus: 'HELD',
      captureStatus: 'PENDING',
      reauthCount: { lt: 3 },
      joinedAt: { lt: cutoff },
      stripeCustomerId: { not: null },
      stripePaymentMethodId: { not: null },
      stripePaymentIntentId: { not: null },
      holdAmount: { not: null },
    },
    include: { session: { include: { restaurant: true } } },
  })

  for (const p of expiring) {
    const restaurant = p.session.restaurant
    if (
      !restaurant.stripeConnectAccountId ||
      !restaurant.stripeConnectOnboarded ||
      p.holdAmount == null
    ) {
      continue
    }

    await prisma.tabParticipant.update({
      where: { id: p.id },
      data: { holdStatus: 'REAUTHORIZING' },
    })

    try {
      const newPi = await stripe.paymentIntents.create(
        {
          ...STRIPE_PAYMENT_INTENT_CARD_ONLY,
          amount: p.holdAmount,
          currency: 'usd',
          customer: p.stripeCustomerId!,
          payment_method: p.stripePaymentMethodId!,
          capture_method: 'manual',
          confirm: true,
          off_session: true,
          metadata: {
            participantId: p.id,
            sessionId: p.sessionId,
            type: 'reauth',
          },
        },
        {
          idempotencyKey: `reauth-${p.id}-${p.reauthCount + 1}`,
          stripeAccount: restaurant.stripeConnectAccountId,
        },
      )

      await stripe.paymentIntents.cancel(p.stripePaymentIntentId!)

      await prisma.tabParticipant.update({
        where: { id: p.id },
        data: {
          stripePaymentIntentId: newPi.id,
          holdAmount: p.holdAmount,
          holdStatus: 'HELD',
          reauthCount: { increment: 1 },
        },
      })
    } catch (err) {
      console.error('[cron/cleanupSessions] reauth failed', p.id, err)
      await prisma.tabParticipant.update({
        where: { id: p.id },
        data: { holdStatus: 'EXPIRED' },
      })
      // TODO(phase-5): urgent push + Resend + Twilio per §11.9
    }
  }
}

// Phase 6 / v2: Gemini-powered weekly purchase order generation
async function generateWeeklyForecasts(): Promise<void> {
  // TODO v2
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ts = new Date().toISOString()
  const phaseErrors: { phase: string; message: string }[] = []

  for (const run of [
    { name: 'processDepartures', fn: processDepartures },
    { name: 'cleanupSessions', fn: cleanupSessions },
    { name: 'generateWeeklyForecasts', fn: generateWeeklyForecasts },
  ] as const) {
    try {
      await run.fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[cron/maintenance] ${run.name}`, err)
      phaseErrors.push({ phase: run.name, message })
    }
  }

  if (phaseErrors.length > 0) {
    return NextResponse.json({ ok: false, ts, errors: phaseErrors }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ts })
}
