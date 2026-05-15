import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import type { TipSource } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, STRIPE_PAYMENT_INTENT_CARD_ONLY } from '@/lib/stripe'
import { validateUuid } from '@/lib/validate'
import { SettlementActionBodySchema } from '@/lib/schemas/settlements'
import {
  DEFAULT_HOLD_AMOUNT_CENTS,
  LEGACY_DEFAULT_HOLD_CENTS,
  MAX_RESTAURANT_HOLD_CENTS,
  MIN_RESTAURANT_HOLD_CENTS,
  effectiveHoldAmountCents,
} from '@/lib/payment/holdConfig'
import { captureParticipantTab, resolveDefaultTip, type OrderItemStatus } from '@/lib/payment/capture'

function assertManagerPlus(role: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

async function ensureParticipantForRestaurant(participantId: string, restaurantId: string) {
  return prisma.tabParticipant.findFirst({
    where: { id: participantId, session: { restaurantId } },
    include: {
      orders: true,
      session: {
        select: {
          id: true,
          restaurantId: true,
          restaurant: {
            select: {
              stripeConnectAccountId: true,
              stripeConnectOnboarded: true,
              id: true,
              defaultHoldAmount: true,
              walkOutServiceFeePercent: true,
              walkOutServiceFeeFlat: true,
            },
          },
        },
      },
    },
  })
}

async function retryAuthHold(p: Awaited<ReturnType<typeof ensureParticipantForRestaurant>>) {
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { restaurant } = p.session
  if (!restaurant.stripeConnectAccountId || !restaurant.stripeConnectOnboarded) {
    return NextResponse.json({ error: 'Restaurant not onboarded' }, { status: 422 })
  }
  if (!p.stripeCustomerId || !p.stripePaymentMethodId) {
    return NextResponse.json({ error: 'No saved payment method' }, { status: 422 })
  }

  if (
    restaurant.defaultHoldAmount < MIN_RESTAURANT_HOLD_CENTS ||
    restaurant.defaultHoldAmount > MAX_RESTAURANT_HOLD_CENTS
  ) {
    console.error('[settlements/action RETRY_HOLD] defaultHoldAmount out of bounds', restaurant.defaultHoldAmount)
    return NextResponse.json({ error: 'Payment configuration error' }, { status: 422 })
  }

  const holdCents = effectiveHoldAmountCents(restaurant.defaultHoldAmount)

  const newHoldAttempt = p.holdAttempt + 1
  await prisma.tabParticipant.update({
    where: { id: p.id },
    data: {
      holdAttempt: newHoldAttempt,
      holdStatus: 'PENDING',
    },
  })

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        ...STRIPE_PAYMENT_INTENT_CARD_ONLY,
        amount: holdCents,
        currency: 'usd',
        customer: p.stripeCustomerId,
        payment_method: p.stripePaymentMethodId,
        capture_method: 'manual',
        confirm: true,
        off_session: true,
        metadata: { sessionId: p.sessionId, participantId: p.id, type: 'auth_hold' },
      },
      {
        idempotencyKey: `hold-${p.id}-${newHoldAttempt}`,
        stripeAccount: restaurant.stripeConnectAccountId,
      },
    )

    // Manual capture authorizations are `requires_capture`, not `succeeded`.
    if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture') {
      await prisma.tabParticipant.update({
        where: { id: p.id },
        data: {
          stripePaymentIntentId: paymentIntent.id,
          holdAmount: holdCents,
          holdStatus: 'HELD',
        },
      })
      if (restaurant.defaultHoldAmount === LEGACY_DEFAULT_HOLD_CENTS) {
        void prisma.restaurant
          .updateMany({
            where: { id: restaurant.id, defaultHoldAmount: LEGACY_DEFAULT_HOLD_CENTS },
            data: { defaultHoldAmount: DEFAULT_HOLD_AMOUNT_CENTS },
          })
          .catch((err: unknown) =>
            console.error('[settlements/action RETRY_HOLD] legacy defaultHoldAmount backfill failed', err),
          )
      }
      return NextResponse.json({ ok: true, status: 'held' })
    }
    if (paymentIntent.status === 'requires_action') {
      await prisma.tabParticipant.update({
        where: { id: p.id },
        data: { stripePaymentIntentId: paymentIntent.id },
      })
      return NextResponse.json({ ok: true, status: 'requires_action', clientSecret: paymentIntent.client_secret })
    }
    await prisma.tabParticipant.update({ where: { id: p.id }, data: { holdStatus: 'FAILED' } })
    return NextResponse.json({ error: 'Hold failed' }, { status: 402 })
  } catch (err: unknown) {
    const stripeError = err as { type?: string; message?: string }
    if (stripeError.type === 'StripeCardError') {
      await prisma.tabParticipant.update({ where: { id: p.id }, data: { holdStatus: 'FAILED' } })
      return NextResponse.json({ error: 'Card declined' }, { status: 402 })
    }
    console.error('[settlements/action RETRY_HOLD]', stripeError.message)
    return NextResponse.json({ error: 'Payment processing failed' }, { status: 500 })
  }
}

function orderSnapshotsFromParticipant(p: NonNullable<Awaited<ReturnType<typeof ensureParticipantForRestaurant>>>) {
  return p.orders.map((o) => ({
    unitPrice: new Decimal(o.unitPrice.toString()),
    quantity: o.quantity,
    taxAmount: new Decimal(o.taxAmount.toString()),
    status: o.status as OrderItemStatus,
  }))
}

function tipTimeoutDefaultCents(p: NonNullable<Awaited<ReturnType<typeof ensureParticipantForRestaurant>>>) {
  const snaps = orderSnapshotsFromParticipant(p)
  const subtotalDecimal = snaps
    .filter((s) => s.status !== 'CANCELLED' && s.status !== 'CASH_PENDING')
    .reduce((acc, s) => acc.plus(s.unitPrice.times(s.quantity)), new Decimal(0))
  return resolveDefaultTip(subtotalDecimal, 'TIMEOUT_DEFAULT').times(100).toDecimalPlaces(0).toNumber()
}

async function runCapture(
  p: NonNullable<Awaited<ReturnType<typeof ensureParticipantForRestaurant>>>,
  tipCents: number,
  tipSource: TipSource,
) {
  const { restaurant } = p.session
  // Allow dashboard retry after a failed capture (compare-and-swap expects PENDING).
  await prisma.tabParticipant.updateMany({
    where: { id: p.id, captureStatus: 'FAILED' },
    data: { captureStatus: 'PENDING' },
  })

  if (p.holdStatus !== 'HELD') {
    return NextResponse.json({ error: 'Hold not active' }, { status: 409 })
  }
  if (
    !p.stripePaymentIntentId ||
    p.holdAmount == null ||
    !p.stripeCustomerId ||
    !p.stripePaymentMethodId ||
    !restaurant.stripeConnectAccountId
  ) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 422 })
  }

  const cas = await prisma.tabParticipant.updateMany({
    where: { id: p.id, captureStatus: 'PENDING' },
    data: { captureStatus: 'PROCESSING' },
  })
  if (cas.count === 0) {
    return NextResponse.json({ ok: true, raced: true })
  }

  try {
    await captureParticipantTab({
      participantId: p.id,
      holdAmount: p.holdAmount,
      stripePaymentIntentId: p.stripePaymentIntentId,
      stripeCustomerId: p.stripeCustomerId,
      stripePaymentMethodId: p.stripePaymentMethodId,
      stripeConnectAccountId: restaurant.stripeConnectAccountId,
      resolvedTipAmountCents: tipCents,
      resolvedTipSource: tipSource,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[settlements/action capture]', err)
    return NextResponse.json({ error: 'Capture failed' }, { status: 500 })
  }
}

/**
 * POST /api/restaurant/settlements/[participantId]/action
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const { participantId } = await params
  const invalid = validateUuid(participantId, 'participantId')
  if (invalid) return invalid

  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!assertManagerPlus(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SettlementActionBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { action } = parsed.data
  const p = await ensureParticipantForRestaurant(participantId, session.user.restaurantId)
  if (!p) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  switch (action) {
    case 'RETRY_HOLD':
      return retryAuthHold(p)

    case 'RETRY_CAPTURE': {
      const tipCents =
        p.resolvedTipAmount != null ? p.resolvedTipAmount : tipTimeoutDefaultCents(p)
      const tipSource: TipSource =
        p.resolvedTipSource != null ? p.resolvedTipSource : 'TIMEOUT_DEFAULT'
      return runCapture(p, tipCents, tipSource)
    }

    case 'FORCE_20_CAPTURE': {
      const tipCents = tipTimeoutDefaultCents(p)
      return runCapture(p, tipCents, 'TIMEOUT_DEFAULT')
    }

    case 'WRITE_OFF': {
      await prisma.tabParticipant.update({
        where: { id: p.id },
        data: {
          captureStatus: 'SKIPPED',
          holdStatus: 'NONE',
        },
      })
      return NextResponse.json({ ok: true })
    }

    case 'REQUEST_NEW_CARD': {
      // TODO(phase-5): Resend email with join link / payment update flow
      console.warn('[settlements/action] REQUEST_NEW_CARD stub', p.id)
      return NextResponse.json({ ok: true, stub: true })
    }

    case 'REFUND': {
      if (!p.stripePaymentIntentId) {
        return NextResponse.json({ error: 'No payment intent' }, { status: 422 })
      }
      try {
        const pi = await stripe.paymentIntents.retrieve(p.stripePaymentIntentId)
        const received = pi.amount_received ?? 0
        if (received <= 0) {
          return NextResponse.json({ error: 'Nothing to refund' }, { status: 422 })
        }
        await stripe.refunds.create({
          payment_intent: p.stripePaymentIntentId,
          amount: received,
        })
        return NextResponse.json({ ok: true })
      } catch (err) {
        console.error('[settlements/action REFUND]', err)
        return NextResponse.json({ error: 'Refund failed' }, { status: 500 })
      }
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
