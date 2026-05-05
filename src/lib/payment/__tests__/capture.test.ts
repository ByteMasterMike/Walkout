/**
 * capture.test.ts — Full TDD test suite for captureParticipantTab()
 *
 * ALL 20 tests are in RED state until implementation replaces the stubs.
 * Each test encodes exactly ONE acceptance criterion from the spec.
 *
 * Spec sources:
 *   §11.4  — capture math
 *   §11.5  — overflow prorating
 *   §17.8  — pro-rata fee allocation
 *   §18    — tip resolution
 *   Appendix D, Appendix E — canonical money-flow invariants
 *   v5.2   — "Table Cleared ≠ capture" and "tip-first, then capture"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Decimal } from 'decimal.js'
import * as captureModule from '../capture'
import {
  computeCapture,
  allocateFee,
  computeOverflowFees,
  resolveDefaultTip,
  isCaptureAllowed,
  type OrderItemSnapshot,
} from '../capture'

// ================================================================
// TEST HELPERS
// ================================================================

/** Build a minimal SERVED OrderItemSnapshot with sensible defaults. */
function makeOrder(overrides: Partial<OrderItemSnapshot> = {}): OrderItemSnapshot {
  return {
    unitPrice: new Decimal('10.00'),
    quantity: 1,
    taxAmount: new Decimal('0.60'),
    status: 'SERVED',
    ...overrides,
  }
}

/** Standard service fee config used by WalkOut (0.5%, no flat fee). */
const STANDARD_FEE = {
  serviceFeePercent: new Decimal('0.005'),
  serviceFeeFlatCents: 0,
}

// ================================================================
// §11.4 — CAPTURE MATH (tests 1–9)
// ================================================================

describe('computeCapture — §11.4 capture math', () => {
  /**
   * TDD Cycle 1 — Criterion: Subtotal uses snapshotted unitPrice × quantity,
   * not a live menu price lookup.
   */
  it('1. subtotal = Σ(unitPrice × quantity) from non-cancelled orders (snapshot values)', () => {
    const orders: OrderItemSnapshot[] = [
      makeOrder({ unitPrice: new Decimal('12.50'), quantity: 2, taxAmount: new Decimal('1.50') }),
      makeOrder({ unitPrice: new Decimal('8.00'),  quantity: 1, taxAmount: new Decimal('0.48') }),
    ]

    const result = computeCapture({
      ...STANDARD_FEE,
      orders,
      resolvedTipAmount: new Decimal(0),
    })

    // 12.50 × 2 + 8.00 × 1 = 33.00
    expect(result.subtotal.equals(new Decimal('33.00'))).toBe(true)
    expect(result.subtotalCents).toBe(3300)
  })

  /**
   * TDD Cycle 2 — Criterion: Tax uses snapshotted OrderItem.taxAmount.
   * Must never recompute tax from restaurant.taxRate (§12.3, §7.2 rule 4).
   * Two items with the same unit price but DIFFERENT snapshotted tax amounts
   * must produce their respective snapshots, not a recomputed figure.
   */
  it('2. tax = Σ(OrderItem.taxAmount) — never recomputed from taxRate', () => {
    const orders: OrderItemSnapshot[] = [
      // item snapshotted at 6% tax
      makeOrder({ unitPrice: new Decimal('10.00'), taxAmount: new Decimal('0.60') }),
      // same price but snapshotted when tax rate was 8% (mid-session rate change scenario)
      makeOrder({ unitPrice: new Decimal('10.00'), taxAmount: new Decimal('0.80') }),
    ]

    const result = computeCapture({
      ...STANDARD_FEE,
      orders,
      resolvedTipAmount: new Decimal(0),
    })

    // Tax must be 0.60 + 0.80 = 1.40 — NOT 20.00 × 0.06 = 1.20
    expect(result.tax.equals(new Decimal('1.40'))).toBe(true)
    expect(result.taxCents).toBe(140)
  })

  /**
   * TDD Cycle 3 — Criterion: Service fee = 0.5% of PRE-TAX subtotal ONLY.
   * Not 0.5% of (subtotal + tax). Not 0.5% of (subtotal + tax + tip).
   * Not 0.5% of service requests (service requests are not OrderItems).
   */
  it('3. service fee = 0.5% of pre-tax subtotal only (not on tax, tip, or service requests)', () => {
    const orders: OrderItemSnapshot[] = [
      makeOrder({ unitPrice: new Decimal('50.00'), taxAmount: new Decimal('3.00') }),
    ]

    const result = computeCapture({
      ...STANDARD_FEE,
      orders,
      resolvedTipAmount: new Decimal('10.00'), // tip must not affect fee base
    })

    // 0.5% × $50.00 = $0.25 — tip ($10) and tax ($3) are excluded from the base
    expect(result.serviceFee.equals(new Decimal('0.25'))).toBe(true)
    expect(result.serviceFeeCents).toBe(25)
  })

  /**
   * TDD Cycle 4 — Criterion: Tip percentage applies to PRE-TAX subtotal only.
   * 20% of $50.00 = $10.00, NOT 20% of $53.25 ($50 + $3 + $0.25).
   */
  it('4. tip is percentage of pre-tax subtotal only (not of total-including-tax)', () => {
    const subtotal = new Decimal('50.00')
    const tipPercent = new Decimal('0.20')
    const expectedTip = subtotal.times(tipPercent) // $10.00

    const result = computeCapture({
      ...STANDARD_FEE,
      orders: [makeOrder({ unitPrice: subtotal, taxAmount: new Decimal('3.00') })],
      resolvedTipAmount: expectedTip,
    })

    expect(result.tip.equals(new Decimal('10.00'))).toBe(true)
    expect(result.tipCents).toBe(1000)
  })

  /**
   * TDD Cycle 5 — Criterion: total = subtotal + tax + serviceFee + tip (one combined charge, v5.2).
   */
  it('5. total = subtotal + tax + serviceFee + tip (single combined charge)', () => {
    const result = computeCapture({
      ...STANDARD_FEE,
      orders: [makeOrder({ unitPrice: new Decimal('50.00'), taxAmount: new Decimal('3.00') })],
      resolvedTipAmount: new Decimal('10.00'),
    })

    const expected = result.subtotal
      .plus(result.tax)
      .plus(result.serviceFee)
      .plus(result.tip)

    expect(result.total.equals(expected)).toBe(true)
    expect(result.totalCents).toBe(
      result.subtotalCents + result.taxCents + result.serviceFeeCents + result.tipCents,
    )
  })

  /**
   * TDD Cycle 6 — Criterion: applicationFeeCents = serviceFeeCents ONLY.
   * Tax belongs to the restaurant (remitted to PA).
   * Tip belongs to the restaurant/server.
   * WalkOut's cut is the service fee and nothing else (§11.4, §13).
   */
  it('6. applicationFeeCents = serviceFeeCents only — not tip, not tax', () => {
    const result = computeCapture({
      ...STANDARD_FEE,
      orders: [makeOrder({ unitPrice: new Decimal('50.00'), taxAmount: new Decimal('3.00') })],
      resolvedTipAmount: new Decimal('10.00'),
    })

    expect(result.applicationFeeCents).toBe(result.serviceFeeCents)
    // Explicitly not the total-fee, not tax, not tip
    expect(result.applicationFeeCents).not.toBe(result.totalCents)
    expect(result.applicationFeeCents).not.toBe(result.tipCents + result.serviceFeeCents)
  })

  /**
   * TDD Cycle 7 — Criterion: CANCELLED order items are excluded from ALL calculations.
   */
  it('7. CANCELLED items excluded from subtotal, tax, and service fee', () => {
    const orders: OrderItemSnapshot[] = [
      makeOrder({ unitPrice: new Decimal('20.00'), taxAmount: new Decimal('1.20'), status: 'SERVED' }),
      makeOrder({ unitPrice: new Decimal('15.00'), taxAmount: new Decimal('0.90'), status: 'CANCELLED' }),
      makeOrder({ unitPrice: new Decimal('10.00'), taxAmount: new Decimal('0.60'), status: 'SERVED' }),
    ]

    const result = computeCapture({
      ...STANDARD_FEE,
      orders,
      resolvedTipAmount: new Decimal(0),
    })

    // Only the two non-CANCELLED items count
    expect(result.subtotal.equals(new Decimal('30.00'))).toBe(true) // 20 + 10
    expect(result.tax.equals(new Decimal('1.80'))).toBe(true)       // 1.20 + 0.60
    // 0.5% × $30 = $0.15
    expect(result.serviceFee.equals(new Decimal('0.15'))).toBe(true)
  })

  /**
   * TDD Cycle 8 — Criterion: CASH_PENDING order items are excluded from ALL calculations.
   * Cash items are settled via the physical cash path — they must not appear in
   * the card capture to avoid double-charging (§11.4).
   */
  it('8. CASH_PENDING items excluded from subtotal, tax, and service fee', () => {
    const orders: OrderItemSnapshot[] = [
      makeOrder({ unitPrice: new Decimal('25.00'), taxAmount: new Decimal('1.50'), status: 'SERVED' }),
      makeOrder({ unitPrice: new Decimal('12.00'), taxAmount: new Decimal('0.72'), status: 'CASH_PENDING' }),
    ]

    const result = computeCapture({
      ...STANDARD_FEE,
      orders,
      resolvedTipAmount: new Decimal(0),
    })

    // Only the card item counts — cash item is excluded
    expect(result.subtotal.equals(new Decimal('25.00'))).toBe(true)
    expect(result.tax.equals(new Decimal('1.50'))).toBe(true)
    // 0.5% × $25 = $0.125 → rounds to $0.13
    expect(result.serviceFee.equals(new Decimal('0.13'))).toBe(true)
  })

  /**
   * TDD Cycle 9 — Criterion: Service requests do NOT contribute to subtotal, tax, or fee.
   * Service requests (WATER, REFILL, etc.) are not OrderItems and have no monetary value.
   * computeCapture() only accepts OrderItemSnapshot[] — service requests cannot be injected.
   * An empty orders array (all service requests, no food) gives $0 everywhere.
   */
  it('9. service requests are structurally excluded — empty order array yields $0 everywhere', () => {
    const result = computeCapture({
      ...STANDARD_FEE,
      orders: [], // no food orders; caller may have service requests, but they are not passed here
      resolvedTipAmount: new Decimal(0),
    })

    expect(result.subtotal.equals(new Decimal(0))).toBe(true)
    expect(result.tax.equals(new Decimal(0))).toBe(true)
    expect(result.serviceFee.equals(new Decimal(0))).toBe(true)
    expect(result.applicationFeeCents).toBe(0)
    expect(result.totalCents).toBe(0)
  })
})

// ================================================================
// §11.5 — OVERFLOW PRORATING (tests 10–12)
// ================================================================

describe('computeOverflowFees — §11.5 overflow capture', () => {
  /**
   * TDD Cycle 10 — Criterion: Standard path (total ≤ hold) → single PI, no overflow.
   * The full application fee goes to the single capture.
   */
  it('10. standard path: totalCents ≤ holdAmount → isOverflow=false, holdFeeCents=appFee, overflow=0', () => {
    const result = computeOverflowFees({
      applicationFeeCents: 25,
      holdAmount: 7500,    // $75.00 hold
      totalCents: 6325,    // $63.25 bill — under the hold
    })

    expect(result.isOverflow).toBe(false)
    expect(result.holdFeeCents).toBe(25)     // full appFee on the single PI
    expect(result.overflowFeeCents).toBe(0)
    expect(result.overflowAmountCents).toBe(0)
  })

  /**
   * TDD Cycle 11 — Criterion: Overflow path (total > hold) → two PIs.
   * Hold PI captures holdAmount; overflow PI captures the remainder.
   */
  it('11. overflow path: totalCents > holdAmount → isOverflow=true, overflowAmountCents = total − hold', () => {
    const result = computeOverflowFees({
      applicationFeeCents: 50,
      holdAmount: 7500,    // $75 hold
      totalCents: 10000,   // $100 bill — overflow of $25
    })

    expect(result.isOverflow).toBe(true)
    expect(result.overflowAmountCents).toBe(2500) // 10000 − 7500
    // Both halves must exist
    expect(result.holdFeeCents).toBeGreaterThan(0)
    expect(result.holdFeeCents + result.overflowFeeCents).toBe(50)
  })

  /**
   * TDD Cycle 12 — Criterion: Floor-then-remainder guarantees no rounding drift.
   *
   * holdFeeCents     = Math.floor(appFee × holdAmount / totalCents)
   * overflowFeeCents = appFee − holdFeeCents   ← exact, never round
   *
   * Using Math.round on both halves can produce sum = appFee + 1 cent.
   * This test picks numbers where round and floor disagree.
   */
  it('12. floor-then-remainder: holdFeeCents + overflowFeeCents === applicationFeeCents exactly', () => {
    // Math.floor(214 × 7500 / 12000) = Math.floor(133.75) = 133
    // overflowFeeCents = 214 − 133 = 81
    // If Math.round were used: round(133.75) = 134, then 214 − 134 = 80, sum = 214 ✓
    // but round(134) + round(80) ≠ necessarily 214 in all cases.
    // This specific case also tests the exact values.
    const result = computeOverflowFees({
      applicationFeeCents: 214,
      holdAmount: 7500,
      totalCents: 12000,
    })

    expect(result.holdFeeCents).toBe(133)    // Math.floor(214 × 7500 / 12000)
    expect(result.overflowFeeCents).toBe(81) // 214 − 133 (exact remainder)
    expect(result.holdFeeCents + result.overflowFeeCents).toBe(214)
  })
})

// ================================================================
// §17.8 — PRO-RATA FEE ALLOCATION (tests 13–14)
// ================================================================

describe('allocateFee — §17.8 pro-rata fee allocation', () => {
  /**
   * TDD Cycle 13 — Criterion: Four allocations sum EXACTLY to total Stripe fee.
   * No cent must be missing or extra after rounding. This invariant is tested
   * with the canonical Appendix E numbers.
   */
  it('13. food+tax+serviceFee+tip allocations sum EXACTLY to totalFeeCents — no rounding drift', () => {
    const allocation = allocateFee({
      totalFeeCents: 214, // $2.14 Stripe fee on the $63.25 canonical charge
      components: {
        foodCents:       5000, // $50.00
        taxCents:         300, // $3.00
        serviceFeeCents:   25, // $0.25
        tipCents:        1000, // $10.00
      },
    })

    const sum = allocation.food + allocation.tax + allocation.serviceFee + allocation.tip
    expect(sum).toBe(214)
  })

  /**
   * TDD Cycle 14 — Criterion: Tip's fee share uses banker rounding (round), not floor.
   *
   * tipShare = round(tipCents / totalCents × stripeFeeCents)
   *
   * Constructed so that tipShare = 9.99 cents:
   *   tipCents=333, total=1000, stripeFee=30
   *   333/1000 × 30 = 9.99 → round = 10, floor = 9
   *
   * If the implementor uses Math.floor, allocation.tip will be 9, not 10.
   */
  it('14. tip fee share uses round (not floor) — 0.99 fractional cent rounds up to correct value', () => {
    const allocation = allocateFee({
      totalFeeCents: 30,
      components: {
        foodCents:       667,
        taxCents:          0,
        serviceFeeCents:   0,
        tipCents:        333,
      },
    })

    // round(333/1000 × 30) = round(9.99) = 10 ← correct
    // floor(333/1000 × 30) = floor(9.99) = 9  ← would be wrong
    expect(allocation.tip).toBe(10)
    // Food absorbs the rounding remainder: 30 − 0 − 0 − 10 = 20
    expect(allocation.food).toBe(20)
    expect(allocation.food + allocation.tip).toBe(30)
  })
})

// ================================================================
// §18 — TIP RESOLUTION (tests 15–17)
// ================================================================

describe('resolveDefaultTip — §18 tip resolution', () => {
  /**
   * TDD Cycle 15 — Criterion: resolvedTipAmount = 0 for AUTO_NONE or DINER_DECLINED.
   * "No tip" is a first-class outcome that fires capture immediately at $0 (§18.2).
   */
  it('15. AUTO_NONE and DINER_DECLINED both produce $0 resolved tip', () => {
    const subtotal = new Decimal('50.00')

    const noTipAuto    = resolveDefaultTip(subtotal, 'AUTO_NONE')
    const noTipDecline = resolveDefaultTip(subtotal, 'DINER_DECLINED')

    expect(noTipAuto.equals(new Decimal(0))).toBe(true)
    expect(noTipDecline.equals(new Decimal(0))).toBe(true)
  })

  /**
   * TDD Cycle 16 — Criterion: TIMEOUT_DEFAULT fires 20% of PRE-TAX subtotal.
   * The 15-minute clock ran out; cron applies the 20% default (§18.3, §11.1).
   * Tip is 20% of $50 = $10.00, NOT 20% of any total-including-tax.
   */
  it('16. TIMEOUT_DEFAULT → resolvedTipAmount = subtotal × 0.20 (pre-tax subtotal only)', () => {
    const subtotal = new Decimal('50.00')
    const tip = resolveDefaultTip(subtotal, 'TIMEOUT_DEFAULT')

    expect(tip.equals(new Decimal('10.00'))).toBe(true)
  })

  /**
   * TDD Cycle 17 — Criterion: Tip is included in the SINGLE combined capture total (v5.2).
   * There is no second PaymentIntent for tip. The combined total absorbs food+tax+fee+tip.
   * This eliminates the extra $0.30 Stripe flat fee that the v5.1 two-charge model incurred.
   */
  it('17. tip is part of single combined totalCents — no separate tipPaymentIntentAmount field', () => {
    const result = computeCapture({
      ...STANDARD_FEE,
      orders: [makeOrder({ unitPrice: new Decimal('50.00'), taxAmount: new Decimal('3.00') })],
      resolvedTipAmount: new Decimal('10.00'),
    })

    // The tip must be reflected in totalCents
    expect(result.tipCents).toBe(1000)
    expect(result.totalCents).toBeGreaterThan(result.subtotalCents + result.taxCents + result.serviceFeeCents)

    // There must be no field that represents a second payment intent for tip
    expect('tipPaymentIntentAmountCents' in result).toBe(false)

    // Single total = all four components together
    expect(result.totalCents).toBe(
      result.subtotalCents + result.taxCents + result.serviceFeeCents + result.tipCents,
    )
  })
})

// ================================================================
// APPENDIX E — CANONICAL $50 + $10 TEST (test 18)
// ================================================================

describe('Appendix E — canonical $50 meal + $10 tip money flow', () => {
  /**
   * TDD Cycle 18 — THE CANARY TEST.
   *
   * Appendix E canonical case: $50 food, 6% PA tax, 0.5% WalkOut fee, 20% tip.
   *
   * Expected from the PRD Appendix E table:
   *   Diner total charged: $63.25
   *   Stripe fees:          $2.14  (2.9% × $63.25 + $0.30)
   *   WalkOut net:          $0.24  ($0.25 − $0.01 fee share)
   *   PA tax net:           $2.90  ($3.00 − $0.10 fee share)
   *   Restaurant food net: $48.31  ($50.00 − $1.69 fee share)
   *   Server tip net:       $9.66  ($10.00 − $0.34 fee share)
   *   Verified total:      $63.25  ✓
   *
   * If this test ever fails, something broke in the payment pipeline.
   */
  it('18. Appendix E: $50 food + 6% tax + 0.5% fee + $10 tip → all amounts match exactly', () => {
    // ── Step 1: Capture math ──────────────────────────────────────────────
    const capture = computeCapture({
      serviceFeePercent: new Decimal('0.005'),
      serviceFeeFlatCents: 0,
      orders: [
        {
          unitPrice: new Decimal('50.00'),
          quantity: 1,
          taxAmount: new Decimal('3.00'), // snapshotted at 6% of $50
          status: 'SERVED',
        },
      ],
      resolvedTipAmount: new Decimal('10.00'),
    })

    expect(capture.subtotal.equals(new Decimal('50.00'))).toBe(true)
    expect(capture.tax.equals(new Decimal('3.00'))).toBe(true)
    expect(capture.serviceFee.equals(new Decimal('0.25'))).toBe(true)
    expect(capture.tip.equals(new Decimal('10.00'))).toBe(true)
    expect(capture.total.equals(new Decimal('63.25'))).toBe(true)
    expect(capture.totalCents).toBe(6325)
    expect(capture.applicationFeeCents).toBe(25) // service fee only

    // ── Step 2: Stripe fee (hardcoded — computed by Stripe, not by us) ──
    // 2.9% × $63.25 + $0.30 = $1.8343 + $0.30 = $2.1343 → $2.14
    const stripeFeeCents = 214

    // ── Step 3: Pro-rata fee allocation ──────────────────────────────────
    const allocation = allocateFee({
      totalFeeCents: stripeFeeCents,
      components: {
        foodCents:       capture.subtotalCents,   // 5000
        taxCents:        capture.taxCents,         // 300
        serviceFeeCents: capture.serviceFeeCents,  // 25
        tipCents:        capture.tipCents,         // 1000
      },
    })

    // Exact Appendix E numbers from §17.8 worked example
    expect(allocation.food).toBe(169)        // $1.69  (79.05% × $2.14)
    expect(allocation.tax).toBe(10)          // $0.10  (4.74%  × $2.14)
    expect(allocation.serviceFee).toBe(1)    // $0.01  (0.40%  × $2.14)
    expect(allocation.tip).toBe(34)          // $0.34  (15.81% × $2.14)

    // No rounding drift
    expect(allocation.food + allocation.tax + allocation.serviceFee + allocation.tip).toBe(214)

    // ── Step 4: Net amounts per party ────────────────────────────────────
    const walkoutNet   = capture.applicationFeeCents - allocation.serviceFee // 25 − 1  = 24
    const serverTipNet = capture.tipCents            - allocation.tip        // 1000 − 34 = 966
    const foodNet      = capture.subtotalCents       - allocation.food       // 5000 − 169 = 4831
    const taxNet       = capture.taxCents            - allocation.tax        // 300 − 10  = 290

    expect(walkoutNet).toBe(24)     // $0.24  (Appendix E: WalkOut receives)
    expect(serverTipNet).toBe(966)  // $9.66  (Appendix E: Alex server tip net)
    expect(foodNet).toBe(4831)      // $48.31 (Appendix E: Restaurant food net)
    expect(taxNet).toBe(290)        // $2.90  (Appendix E: Pennsylvania tax net)

    // ── Step 5: Grand total reconciliation ───────────────────────────────
    // Stripe fee + WalkOut net + PA tax + restaurant food + server tip = diner's charge
    const grandTotal = stripeFeeCents + walkoutNet + taxNet + foodNet + serverTipNet
    expect(grandTotal).toBe(capture.totalCents) // 214 + 24 + 290 + 4831 + 966 = 6325 ✓
  })
})

// ================================================================
// v5.2 INVARIANTS (tests 19–20)
// ================================================================

describe('v5.2 architectural invariants', () => {
  /**
   * TDD Cycle 19 — Criterion: "Table Cleared" does NOT fire capture.
   *
   * §11.6: seating state and payment state are TWO INDEPENDENT state machines.
   * Staff clearing a table only flips the table to AVAILABLE and sets
   * seatingClearedAt. Any session in AWAITING_TIP continues its tip countdown.
   *
   * clearTable() MUST NOT call captureParticipantTab() under any circumstances.
   */
  it('19. clearTable() does NOT invoke captureParticipantTab (seating ≠ payment state)', async () => {
    const captureSpy = vi
      .spyOn(captureModule, 'captureParticipantTab')
      .mockResolvedValue(undefined)

    await captureModule.clearTable({ sessionId: 'sess-abc', tableId: 'tbl-7' })

    expect(captureSpy).not.toHaveBeenCalled()
    captureSpy.mockRestore()
  })

  /**
   * TDD Cycle 20 — Criterion: Capture is only allowed when tip is resolved
   * AND captureStatus is PENDING (one and only one capture fires per participant).
   *
   * §18.6: The compare-and-swap PENDING → PROCESSING (DB-level) is the atomic gate.
   * isCaptureAllowed() is the pure pre-flight check for the logic layer:
   *   - captureStatus must be 'PENDING'
   *   - resolvedTipAmount must not be null/undefined (tip must be resolved first)
   *   - resolvedTipAmount === 0 IS allowed ("No tip" is a valid resolved state)
   */
  it('20. isCaptureAllowed: PENDING+resolved→true, non-PENDING→false, null tip→false', () => {
    // Valid: status=PENDING and tip has been resolved (non-null)
    expect(isCaptureAllowed({ captureStatus: 'PENDING',    resolvedTipAmount: 1000 })).toBe(true)
    expect(isCaptureAllowed({ captureStatus: 'PENDING',    resolvedTipAmount: 0 })).toBe(true)  // $0 tip

    // Invalid: tip not yet resolved
    expect(isCaptureAllowed({ captureStatus: 'PENDING',    resolvedTipAmount: null })).toBe(false)
    expect(isCaptureAllowed({ captureStatus: 'PENDING',    resolvedTipAmount: undefined })).toBe(false)

    // Invalid: already processing or completed (prevents double-capture)
    expect(isCaptureAllowed({ captureStatus: 'PROCESSING', resolvedTipAmount: 1000 })).toBe(false)
    expect(isCaptureAllowed({ captureStatus: 'CAPTURED',   resolvedTipAmount: 1000 })).toBe(false)
    expect(isCaptureAllowed({ captureStatus: 'FAILED',     resolvedTipAmount: 1000 })).toBe(false)
    expect(isCaptureAllowed({ captureStatus: 'SKIPPED',    resolvedTipAmount: 1000 })).toBe(false)
  })
})
