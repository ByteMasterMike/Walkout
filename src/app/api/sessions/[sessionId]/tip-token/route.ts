import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateUuid } from '@/lib/validate'
import { signTipToken, verifyTipToken } from '@/lib/tip/tipToken'
import { computeCapture, type OrderItemStatus } from '@/lib/payment/capture'

const participantInclude = {
  orders: true,
  session: {
    select: {
      restaurant: {
        select: {
          walkOutServiceFeePercent: true,
          walkOutServiceFeeFlat: true,
        },
      },
    },
  },
} as const

/**
 * GET /api/sessions/[sessionId]/tip-token
 *
 * Returns a signed tip JWT + bill breakdown for the authenticated participant.
 * Session must be in AWAITING_TIP (after checkout / idle departure).
 */
export async function GET(
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

  const { searchParams } = new URL(request.url)
  const queryToken = searchParams.get('token')

  const tab = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  })

  if (!tab) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (tab.status !== 'AWAITING_TIP') {
    return NextResponse.json(
      { error: 'Tip is only available after your table has checked out' },
      { status: 409 },
    )
  }

  const participant = anonToken
    ? await prisma.tabParticipant.findFirst({
        where: { sessionId, anonToken },
        include: participantInclude,
      })
    : nextAuthSession?.user?.email
      ? await prisma.tabParticipant.findFirst({
          where: {
            sessionId,
            diner: { email: nextAuthSession.user.email },
          },
          include: participantInclude,
        })
      : null

  if (!participant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (participant.holdStatus !== 'HELD') {
    return NextResponse.json({ error: 'Payment hold is not active' }, { status: 409 })
  }

  if (participant.captureStatus !== 'PENDING') {
    return NextResponse.json({ error: 'Tab is already settled' }, { status: 409 })
  }

  if (queryToken) {
    try {
      const claims = verifyTipToken(queryToken)
      if (claims.participantId !== participant.id) {
        return NextResponse.json({ error: 'Tip link does not match this tab' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid or expired tip link' }, { status: 401 })
    }
  }

  const restaurant = participant.session.restaurant
  const orderSnapshots = participant.orders.map((o) => ({
    unitPrice: new Decimal(o.unitPrice.toString()),
    quantity: o.quantity,
    taxAmount: new Decimal(o.taxAmount.toString()),
    status: o.status as OrderItemStatus,
  }))

  const cap = computeCapture({
    orders: orderSnapshots,
    serviceFeePercent: new Decimal(restaurant.walkOutServiceFeePercent.toString()),
    serviceFeeFlatCents: restaurant.walkOutServiceFeeFlat,
    resolvedTipAmount: new Decimal(0),
  })

  const token = signTipToken(participant.id, cap.subtotalCents)
  const maxTipCents = Math.floor(cap.subtotalCents * 0.5)

  return NextResponse.json({
    token,
    participantId: participant.id,
    subtotalCents: cap.subtotalCents,
    taxCents: cap.taxCents,
    serviceFeeCents: cap.serviceFeeCents,
    maxTipCents,
    serviceFeePercent: restaurant.walkOutServiceFeePercent.toString(),
  })
}
