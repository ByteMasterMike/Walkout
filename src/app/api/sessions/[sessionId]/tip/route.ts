import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import type { TipSource } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateUuid } from '@/lib/validate'
import { TipSubmitSchema } from '@/lib/schemas/tip'
import { verifyTipToken } from '@/lib/tip/tipToken'
import { captureParticipantTab, computeCapture, type OrderItemStatus } from '@/lib/payment/capture'

/**
 * POST /api/sessions/[sessionId]/tip
 *
 * Resolves tip from signed token + triggers combined capture (PRD §18).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params

  const invalidSessionId = validateUuid(sessionId, 'sessionId')
  if (invalidSessionId) return invalidSessionId

  const anonToken = request.headers.get('x-anon-token')
  const nextAuthSession = await auth()

  if (!anonToken && !nextAuthSession?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = TipSubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { participantId, tipToken, tipCents, tipSource } = parsed.data

  const invalidParticipantId = validateUuid(participantId, 'participantId')
  if (invalidParticipantId) return invalidParticipantId

  if (tipSource === 'DINER_DECLINED' && tipCents !== 0) {
    return NextResponse.json({ error: 'No tip requires tipCents 0' }, { status: 422 })
  }

  let claims: ReturnType<typeof verifyTipToken>
  try {
    claims = verifyTipToken(tipToken)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired tip link' }, { status: 401 })
  }

  if (claims.participantId !== participantId) {
    return NextResponse.json({ error: 'Tip token mismatch' }, { status: 403 })
  }

  if (tipCents > claims.maxTipCents) {
    return NextResponse.json({ error: 'Tip exceeds maximum allowed' }, { status: 422 })
  }

  if (anonToken) {
    const ok = await prisma.tabParticipant.findFirst({
      where: { id: participantId, sessionId, anonToken },
      select: { id: true },
    })
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } else if (nextAuthSession?.user?.email) {
    const ok = await prisma.tabParticipant.findFirst({
      where: {
        id: participantId,
        sessionId,
        diner: { email: nextAuthSession.user.email },
      },
      select: { id: true },
    })
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const participant = await prisma.tabParticipant.findFirst({
    where: { id: participantId, sessionId },
    include: {
      orders: true,
      session: {
        select: {
          restaurant: {
            select: {
              stripeConnectAccountId: true,
              stripeConnectOnboarded: true,
              walkOutServiceFeePercent: true,
              walkOutServiceFeeFlat: true,
            },
          },
        },
      },
    },
  })

  if (!participant) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (participant.captureStatus !== 'PENDING') {
    return NextResponse.json({ ok: true, alreadyResolved: true })
  }

  if (participant.holdStatus !== 'HELD') {
    return NextResponse.json({ error: 'Payment hold not active' }, { status: 409 })
  }

  const restaurant = participant.session.restaurant
  if (!restaurant.stripeConnectAccountId || !restaurant.stripeConnectOnboarded) {
    return NextResponse.json({ error: 'Restaurant payments unavailable' }, { status: 422 })
  }

  const orderSnapshots = participant.orders.map((o) => ({
    unitPrice: new Decimal(o.unitPrice.toString()),
    quantity: o.quantity,
    taxAmount: new Decimal(o.taxAmount.toString()),
    status: o.status as OrderItemStatus,
  }))

  const capCheck = computeCapture({
    orders: orderSnapshots,
    serviceFeePercent: new Decimal(restaurant.walkOutServiceFeePercent.toString()),
    serviceFeeFlatCents: restaurant.walkOutServiceFeeFlat,
    resolvedTipAmount: new Decimal(0),
  })

  if (Math.abs(capCheck.subtotalCents - claims.subtotalCents) > 1) {
    return NextResponse.json({ error: 'Stale tip link — tab changed' }, { status: 409 })
  }

  if (
    !participant.stripePaymentIntentId ||
    participant.holdAmount == null ||
    !participant.stripeCustomerId ||
    !participant.stripePaymentMethodId
  ) {
    return NextResponse.json({ error: 'Missing payment method' }, { status: 422 })
  }

  const resolvedTipSource: TipSource =
    tipSource === 'DINER_DECLINED' ? 'DINER_DECLINED' : 'DINER_CHOICE'

  const cas = await prisma.tabParticipant.updateMany({
    where: { id: participantId, captureStatus: 'PENDING' },
    data: { captureStatus: 'PROCESSING' },
  })
  if (cas.count === 0) {
    return NextResponse.json({ ok: true, raced: true })
  }

  try {
    await captureParticipantTab({
      participantId,
      holdAmount: participant.holdAmount,
      stripePaymentIntentId: participant.stripePaymentIntentId,
      stripeCustomerId: participant.stripeCustomerId,
      stripePaymentMethodId: participant.stripePaymentMethodId,
      stripeConnectAccountId: restaurant.stripeConnectAccountId,
      resolvedTipAmountCents: tipCents,
      resolvedTipSource: resolvedTipSource,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[tip]', err)
    return NextResponse.json({ error: 'Capture failed' }, { status: 500 })
  }
}
