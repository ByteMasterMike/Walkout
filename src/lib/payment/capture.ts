/**
 * capture.ts — WalkOut payment capture module
 *
 * Pure math + orchestrator for Stripe capture / overflow PI creation.
 * Implementation guide: docs/prd/02-payments-and-money.md §11.4, §11.5, §17.8, §18
 */

import type { TipBehavior, TipSource } from '@prisma/client'
import { Decimal } from 'decimal.js'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'

// ================================================================
// TYPES — mirror Prisma schema enums and model shapes
// ================================================================

export type OrderItemStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPPING'
  | 'SERVED'
  | 'CANCELLED'
  | 'CASH_PENDING'

export type CaptureStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'CAPTURED'
  | 'FAILED'
  | 'SKIPPED'

/** Snapshotted OrderItem shape used in capture math — no live DB queries. */
export interface OrderItemSnapshot {
  unitPrice: Decimal
  quantity: number
  taxAmount: Decimal
  status: OrderItemStatus
}

export interface CaptureInput {
  orders: OrderItemSnapshot[]
  /** 0.005 for the standard 0.5% WalkOut service fee */
  serviceFeePercent: Decimal
  /** Flat fee in cents (0 for v1) */
  serviceFeeFlatCents: number
  /** Resolved tip in dollars as Decimal — convert from DB cents before passing */
  resolvedTipAmount: Decimal
}

export interface CaptureResult {
  // Dollar-Decimal values — safe to chain further Decimal operations
  subtotal: Decimal
  tax: Decimal
  serviceFee: Decimal
  tip: Decimal
  total: Decimal
  // Integer cents — for Stripe API calls ONLY; converted once at this boundary
  totalCents: number
  subtotalCents: number
  taxCents: number
  serviceFeeCents: number
  tipCents: number
  /** Stripe application_fee_amount = serviceFeeCents only (§11.4, §13) */
  applicationFeeCents: number
}

// ================================================================
// §11.4 CAPTURE MATH
// ================================================================

/**
 * Compute all capture amounts from snapshotted order data.
 *
 * Rules (§11.4, §7.2):
 * - Subtotal = Σ(unitPrice × quantity) for non-CANCELLED, non-CASH_PENDING orders
 * - Tax = Σ(taxAmount) for same — NEVER recomputed from taxRate
 * - Service fee = 0.5% of pre-tax subtotal ONLY
 * - Tip is the resolved amount (diner choice / timeout default / AUTO_*)
 * - Total = subtotal + tax + serviceFee + tip (one combined charge, v5.2)
 * - applicationFeeCents = serviceFeeCents only (not tip, not tax)
 */
export function computeCapture(input: CaptureInput): CaptureResult {
  const EXCLUDED: OrderItemStatus[] = ['CANCELLED', 'CASH_PENDING']
  const active = input.orders.filter((o) => !EXCLUDED.includes(o.status))

  const subtotal = active.reduce(
    (acc, o) => acc.plus(new Decimal(o.unitPrice).times(o.quantity)),
    new Decimal(0),
  )
  const tax = active.reduce(
    (acc, o) => acc.plus(new Decimal(o.taxAmount)),
    new Decimal(0),
  )

  // Service fee = 0.5% of pre-tax subtotal ONLY (§11.4, §7.2 rule 6)
  const serviceFee = subtotal
    .times(input.serviceFeePercent)
    .plus(new Decimal(input.serviceFeeFlatCents).dividedBy(100))
    .toDecimalPlaces(2)

  const tip = new Decimal(input.resolvedTipAmount)
  const total = subtotal.plus(tax).plus(serviceFee).plus(tip)

  // Convert to integer cents exactly once — at the Stripe boundary
  const subtotalCents   = subtotal.times(100).toDecimalPlaces(0).toNumber()
  const taxCents        = tax.times(100).toDecimalPlaces(0).toNumber()
  const serviceFeeCents = serviceFee.times(100).toDecimalPlaces(0).toNumber()
  const tipCents        = tip.times(100).toDecimalPlaces(0).toNumber()
  const totalCents      = subtotalCents + taxCents + serviceFeeCents + tipCents

  return {
    subtotal,
    tax,
    serviceFee,
    tip,
    total,
    subtotalCents,
    taxCents,
    serviceFeeCents,
    tipCents,
    totalCents,
    applicationFeeCents: serviceFeeCents, // WalkOut's cut = service fee only
  }
}

// ================================================================
// §11.5 OVERFLOW FEE PRORATING
// ================================================================

export interface OverflowFeeInput {
  applicationFeeCents: number
  /** Stripe hold amount in cents */
  holdAmount: number
  /** Total to capture in cents */
  totalCents: number
}

export interface OverflowFeeResult {
  isOverflow: boolean
  /** Fee charged on the original hold PI */
  holdFeeCents: number
  /** Fee charged on the overflow PI (0 when not overflow) */
  overflowFeeCents: number
  /** Amount of the overflow PI in cents (0 when not overflow) */
  overflowAmountCents: number
}

/**
 * Split application fee across hold and overflow PaymentIntents.
 *
 * Uses floor-then-remainder to guarantee the two halves sum EXACTLY to
 * applicationFeeCents with no rounding drift (§11.5).
 *
 * holdFeeCents     = Math.floor(appFee × holdAmount / totalCents)
 * overflowFeeCents = appFee − holdFeeCents   ← exact remainder, never round both halves
 */
export function computeOverflowFees(input: OverflowFeeInput): OverflowFeeResult {
  const { applicationFeeCents, holdAmount, totalCents } = input

  if (totalCents <= holdAmount) {
    return {
      isOverflow: false,
      holdFeeCents: applicationFeeCents,
      overflowFeeCents: 0,
      overflowAmountCents: 0,
    }
  }

  // floor-then-remainder: holdFee + overflowFee === appFee exactly (no rounding drift)
  // Using Math.round on both halves can produce sum = appFee ± 1 cent
  const holdFeeCents = Math.floor((applicationFeeCents * holdAmount) / totalCents)
  const overflowFeeCents = applicationFeeCents - holdFeeCents

  return {
    isOverflow: true,
    holdFeeCents,
    overflowFeeCents,
    overflowAmountCents: totalCents - holdAmount,
  }
}

// ================================================================
// §17.8 PRO-RATA FEE ALLOCATION
// ================================================================

export interface FeeAllocationInput {
  totalFeeCents: number
  components: {
    foodCents: number
    taxCents: number
    serviceFeeCents: number
    tipCents: number
  }
}

export interface FeeAllocation {
  food: number
  tax: number
  serviceFee: number
  tip: number
}

/**
 * Allocate Stripe's blended fee back to each charge component pro-rata.
 *
 * Algorithm (§17.8):
 *   For tax, serviceFee, tip: bankerRound(component / total × stripeFeeCents)
 *   food = stripeFeeCents − tax − serviceFee − tip  ← absorbs all rounding remainder
 *
 * Invariant: food + tax + serviceFee + tip === totalFeeCents exactly (no drift).
 * Written to TabParticipant.feeAllocatedTo*Cents in the webhook handler.
 */
export function allocateFee(input: FeeAllocationInput): FeeAllocation {
  const { totalFeeCents, components } = input
  const totalCents =
    components.foodCents +
    components.taxCents +
    components.serviceFeeCents +
    components.tipCents

  if (totalCents === 0) return { food: 0, tax: 0, serviceFee: 0, tip: 0 }

  // Round non-food shares; food absorbs the rounding remainder as the last term.
  // This guarantees food + tax + serviceFee + tip === totalFeeCents exactly.
  const tip        = Math.round((components.tipCents        / totalCents) * totalFeeCents)
  const tax        = Math.round((components.taxCents        / totalCents) * totalFeeCents)
  const serviceFee = Math.round((components.serviceFeeCents / totalCents) * totalFeeCents)
  const food       = totalFeeCents - tip - tax - serviceFee

  return { food, tax, serviceFee, tip }
}

// ================================================================
// §18 TIP RESOLUTION
// ================================================================

export type TipResolutionSource =
  | 'TIMEOUT_DEFAULT'
  | 'DINER_DECLINED'
  | 'AUTO_NONE'

/**
 * Compute the resolved tip amount for non-DINER_CHOICE paths.
 *
 * - TIMEOUT_DEFAULT → subtotal × 0.20 (20% of pre-tax subtotal, §18.3)
 * - DINER_DECLINED  → Decimal(0)
 * - AUTO_NONE       → Decimal(0)
 *
 * Tip is ALWAYS of pre-tax subtotal only — not on tax, fee, or service requests.
 */
export function resolveDefaultTip(
  subtotal: Decimal,
  source: TipResolutionSource,
): Decimal {
  if (source === 'TIMEOUT_DEFAULT') {
    // 20% of pre-tax subtotal only (§18.3) — not of total including tax/fee
    return new Decimal(subtotal).times(new Decimal('0.20')).toDecimalPlaces(2)
  }
  // DINER_DECLINED and AUTO_NONE both produce $0
  return new Decimal(0)
}

/**
 * Cron timeout tip resolution: diner preference wins over guest participant.tipBehavior (§18.4).
 * ASK → same as TIMEOUT_DEFAULT (20%). AUTO_* → fixed % or zero with source AUTO_PREF.
 */
export function getTimeoutTipResolution(
  subtotal: Decimal,
  participantTipBehavior: TipBehavior,
  dinerDefaultTipBehavior: TipBehavior | null | undefined,
): { tipCents: number; resolvedTipSource: TipSource } {
  const effective = dinerDefaultTipBehavior ?? participantTipBehavior

  if (effective === 'ASK') {
    const tip = resolveDefaultTip(subtotal, 'TIMEOUT_DEFAULT')
    return {
      tipCents: tip.times(100).toDecimalPlaces(0).toNumber(),
      resolvedTipSource: 'TIMEOUT_DEFAULT',
    }
  }

  if (effective === 'AUTO_NONE') {
    return { tipCents: 0, resolvedTipSource: 'AUTO_PREF' }
  }

  const pct =
    effective === 'AUTO_18'
      ? new Decimal('0.18')
      : effective === 'AUTO_22'
        ? new Decimal('0.22')
        : new Decimal('0.20') // AUTO_20

  const tip = subtotal.times(pct).toDecimalPlaces(2)
  return {
    tipCents: tip.times(100).toDecimalPlaces(0).toNumber(),
    resolvedTipSource: 'AUTO_PREF',
  }
}

// ================================================================
// CAPTURE GUARD (§18.6 compare-and-swap prerequisite)
// ================================================================

/**
 * Returns true only when a capture attempt is permissible:
 *   - captureStatus must be 'PENDING' (not already PROCESSING/CAPTURED/FAILED)
 *   - resolvedTipAmount must not be null/undefined (tip must be resolved first)
 *
 * This encodes the v5.2 invariant: capture fires ONLY after tip is resolved.
 * The DB-level compare-and-swap (PENDING → PROCESSING) is the atomic gate;
 * this function is the pre-flight check for the pure logic layer.
 */
export function isCaptureAllowed(participant: {
  captureStatus: CaptureStatus
  resolvedTipAmount: number | null | undefined
}): boolean {
  if (participant.captureStatus !== 'PENDING') return false
  if (participant.resolvedTipAmount === null) return false
  if (participant.resolvedTipAmount === undefined) return false
  return true
}

// ================================================================
// HIGH-LEVEL ORCHESTRATORS (stubs — orchestrate the above functions)
// ================================================================

export interface ClearTableInput {
  sessionId: string
  tableId: string
}

export interface ClearTableResult {
  /** Table is immediately available for new party after staff clears it */
  tableStatus: 'AVAILABLE'
  seatingClearedAt: Date
  // NB: captureStatus is intentionally absent — seating and payment are INDEPENDENT (§11.6)
}

/**
 * Handle "Table Cleared" staff action.
 *
 * v5.2 invariant (§11.6): this function updates seating state ONLY.
 * It MUST NOT call captureParticipantTab under any circumstance.
 * Any session in AWAITING_TIP continues its tip countdown independently.
 */
export async function clearTable(_input: ClearTableInput): Promise<ClearTableResult> {
  // v5.2 §11.6: seating state ONLY — this function MUST NOT call captureParticipantTab.
  // Any session in AWAITING_TIP continues its tip countdown independently.
  return {
    tableStatus: 'AVAILABLE',
    seatingClearedAt: new Date(),
  }
}

export interface CaptureParticipantTabInput {
  participantId: string
  holdAmount: number
  stripePaymentIntentId: string
  stripeCustomerId: string
  stripePaymentMethodId: string
  stripeConnectAccountId: string
  /** Resolved tip in cents (DB stores cents; computeCapture converts to dollars internally) */
  resolvedTipAmountCents: number
  resolvedTipSource: TipSource
}

/**
 * Execute the full capture flow for one participant:
 *   1. computeCapture math from persisted orders
 *   2. computeOverflowFees if needed
 *   3. Stripe PaymentIntent.capture (+ optional overflow PI)
 *   4. Persist resolved tip + component cents; webhook confirms CAPTURED
 *
 * Preconditions:
 *   - Caller MUST have won CAS: TabParticipant.captureStatus === 'PROCESSING'
 *   - Session SHOULD be AWAITING_TIP or CAPTURING (we flip session → CAPTURING here)
 *
 * Called ONLY from:
 *   - Diner explicit tip choice API route
 *   - processDepartures() cron after 15-min timeout
 *
 * NEVER called from clearTable() or any staff seating action.
 */
export async function captureParticipantTab(input: CaptureParticipantTabInput): Promise<void> {
  const participant = await prisma.tabParticipant.findUnique({
    where: { id: input.participantId },
    include: {
      orders: true,
      session: true,
    },
  })

  if (!participant) {
    throw new Error('Participant not found')
  }

  if (participant.captureStatus !== 'PROCESSING') {
    throw new Error(`captureParticipantTab: expected captureStatus PROCESSING, got ${participant.captureStatus}`)
  }

  if (participant.holdStatus !== 'HELD') {
    throw new Error('captureParticipantTab: hold must be HELD')
  }

  if (
    !participant.stripePaymentIntentId ||
    participant.holdAmount == null ||
    !input.stripePaymentIntentId
  ) {
    throw new Error('captureParticipantTab: missing PaymentIntent / hold amount')
  }

  const sessionStatus = participant.session.status
  if (sessionStatus !== 'AWAITING_TIP' && sessionStatus !== 'CAPTURING') {
    throw new Error(`captureParticipantTab: invalid session status ${sessionStatus}`)
  }

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: participant.session.restaurantId },
  })

  const orders: OrderItemSnapshot[] = participant.orders.map((o) => ({
    unitPrice: new Decimal(o.unitPrice.toString()),
    quantity: o.quantity,
    taxAmount: new Decimal(o.taxAmount.toString()),
    status: o.status as OrderItemStatus,
  }))

  const tipDecimal = new Decimal(input.resolvedTipAmountCents).dividedBy(100)

  const cap = computeCapture({
    orders,
    serviceFeePercent: new Decimal(restaurant.walkOutServiceFeePercent.toString()),
    serviceFeeFlatCents: restaurant.walkOutServiceFeeFlat,
    resolvedTipAmount: tipDecimal,
  })

  const feeSplit = computeOverflowFees({
    applicationFeeCents: cap.applicationFeeCents,
    holdAmount: input.holdAmount,
    totalCents: cap.totalCents,
  })

  const stripe = getStripe()

  const persistRow = await prisma.$transaction(async (tx) => {
    await tx.tabSession.updateMany({
      where: {
        id: participant.sessionId,
        status: { in: ['AWAITING_TIP', 'CAPTURING'] },
      },
      data: { status: 'CAPTURING' },
    })

    return tx.tabParticipant.update({
      where: { id: input.participantId, captureStatus: 'PROCESSING' },
      data: {
        captureAttempt: { increment: 1 },
        resolvedTipAmount: input.resolvedTipAmountCents,
        resolvedTipSource: input.resolvedTipSource,
        subtotalCents: cap.subtotalCents,
        taxCents: cap.taxCents,
        serviceFeeCents: cap.serviceFeeCents,
      },
      select: { captureAttempt: true, overflowAttempt: true },
    })
  })

  const captureAttempt = persistRow.captureAttempt

  try {
    if (!feeSplit.isOverflow) {
      await stripe.paymentIntents.capture(
        participant.stripePaymentIntentId,
        {
          amount_to_capture: cap.totalCents,
          application_fee_amount: feeSplit.holdFeeCents,
        },
        { idempotencyKey: `capture-${input.participantId}-${captureAttempt}` },
      )
      return
    }

    await stripe.paymentIntents.capture(
      participant.stripePaymentIntentId,
      {
        amount_to_capture: input.holdAmount,
        application_fee_amount: feeSplit.holdFeeCents,
      },
      { idempotencyKey: `capture-${input.participantId}-${captureAttempt}` },
    )

    const overflowAttemptRow = await prisma.tabParticipant.update({
      where: { id: input.participantId },
      data: { overflowAttempt: { increment: 1 } },
      select: { overflowAttempt: true },
    })

    const overflowPi = await stripe.paymentIntents.create(
      {
        amount: feeSplit.overflowAmountCents,
        currency: 'usd',
        customer: input.stripeCustomerId,
        payment_method: input.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        on_behalf_of: input.stripeConnectAccountId,
        application_fee_amount: feeSplit.overflowFeeCents,
        metadata: {
          participantId: input.participantId,
          sessionId: participant.sessionId,
          type: 'overflow',
        },
      },
      { idempotencyKey: `overflow-${input.participantId}-${overflowAttemptRow.overflowAttempt}` },
    )

    await prisma.tabParticipant.update({
      where: { id: input.participantId },
      data: {
        overflowPaymentIntentId: overflowPi.id,
        overflowAmount: feeSplit.overflowAmountCents,
      },
    })
  } catch (err) {
    console.error('[captureParticipantTab]', err)
    await prisma.tabParticipant.updateMany({
      where: { id: input.participantId, captureStatus: { not: 'CAPTURED' } },
      data: { captureStatus: 'FAILED' },
    })
    throw err
  }
}
