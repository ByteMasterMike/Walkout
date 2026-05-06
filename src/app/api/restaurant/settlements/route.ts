import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeCapture, type OrderItemStatus } from '@/lib/payment/capture'
import type {
  SettlementAction,
  SettlementIssue,
  SettlementRow,
} from '@/lib/schemas/settlements'

function assertManagerPlus(role: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

function inferIssue(participant: {
  holdStatus: string
  captureStatus: string
}): SettlementIssue {
  if (participant.captureStatus === 'FAILED') return 'CAPTURE_FAILED'
  if (participant.holdStatus === 'EXPIRED') return 'HOLD_EXPIRED'
  if (participant.holdStatus === 'FAILED') return 'HOLD_FAILED'
  return 'CAPTURE_FAILED'
}

function actionsFor(issue: SettlementIssue, row: { stripePaymentIntentId: string | null }): SettlementAction[] {
  switch (issue) {
    case 'HOLD_FAILED':
      return ['WRITE_OFF', 'REQUEST_NEW_CARD']
    case 'HOLD_EXPIRED':
      return ['RETRY_HOLD', 'WRITE_OFF']
    case 'CAPTURE_FAILED': {
      const base: SettlementAction[] = ['RETRY_CAPTURE', 'FORCE_20_CAPTURE', 'WRITE_OFF']
      if (row.stripePaymentIntentId) base.push('REFUND')
      return base
    }
    default:
      return ['WRITE_OFF']
  }
}

function estimateDueCents(
  orders: { unitPrice: { toString(): string }; quantity: number; taxAmount: { toString(): string }; status: string }[],
  restaurant: { walkOutServiceFeePercent: { toString(): string }; walkOutServiceFeeFlat: number },
  resolvedTipAmountCents: number | null,
): number {
  const snapshots = orders.map((o) => ({
    unitPrice: new Decimal(o.unitPrice.toString()),
    quantity: o.quantity,
    taxAmount: new Decimal(o.taxAmount.toString()),
    status: o.status as OrderItemStatus,
  }))
  const cap = computeCapture({
    orders: snapshots,
    serviceFeePercent: new Decimal(restaurant.walkOutServiceFeePercent.toString()),
    serviceFeeFlatCents: restaurant.walkOutServiceFeeFlat,
    resolvedTipAmount: new Decimal(resolvedTipAmountCents ?? 0).dividedBy(100),
  })
  return cap.totalCents
}

/**
 * GET /api/restaurant/settlements
 *
 * Pending payment issues for the authenticated restaurant (MANAGER+).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!assertManagerPlus(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const restaurantId = session.user.restaurantId

  const participants = await prisma.tabParticipant.findMany({
    where: {
      session: { restaurantId },
      NOT: { captureStatus: 'SKIPPED' },
      OR: [
        { holdStatus: 'FAILED' },
        { holdStatus: 'EXPIRED' },
        { captureStatus: 'FAILED' },
      ],
    },
    include: {
      orders: true,
      diner: { select: { email: true } },
      session: {
        select: {
          id: true,
          restaurant: {
            select: {
              walkOutServiceFeePercent: true,
              walkOutServiceFeeFlat: true,
            },
          },
          table: { select: { tableNumber: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  const rows: SettlementRow[] = participants.map((p) => {
    const issue = inferIssue(p)
    const amountCents =
      issue === 'HOLD_FAILED'
        ? 0
        : estimateDueCents(p.orders, p.session.restaurant, p.resolvedTipAmount)

    return {
      id: p.id,
      participantId: p.id,
      sessionId: p.sessionId,
      tableNumber: p.session.table.tableNumber,
      dinerName: p.displayName,
      dinerEmail: p.diner?.email ?? null,
      issue,
      amountCents,
      holdAttempt: p.holdAttempt,
      captureAttempt: p.captureAttempt,
      occurredAt: p.updatedAt.toISOString(),
      availableActions: actionsFor(issue, { stripePaymentIntentId: p.stripePaymentIntentId }),
    }
  })

  return NextResponse.json({ settlements: rows })
}
