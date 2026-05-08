/**
 * Appendix E canonical flow — duplicated as a named suite for Phase 5 checklist.
 * (Full suite lives in capture.test.ts test 18.)
 */
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { computeCapture, allocateFee } from '../capture';

describe('Appendix E (canonical file)', () => {
  it('$50 + 6% tax + 0.5% fee + $10 tip → $63.25 charged; nets match Appendix E', () => {
    const capture = computeCapture({
      serviceFeePercent: new Decimal('0.005'),
      serviceFeeFlatCents: 0,
      orders: [
        {
          unitPrice: new Decimal('50.00'),
          quantity: 1,
          taxAmount: new Decimal('3.00'),
          status: 'SERVED',
        },
      ],
      resolvedTipAmount: new Decimal('10.00'),
    });

    expect(capture.totalCents).toBe(6325);
    expect(capture.applicationFeeCents).toBe(25);

    const stripeFeeCents = 214;
    const allocation = allocateFee({
      totalFeeCents: stripeFeeCents,
      components: {
        foodCents: capture.subtotalCents,
        taxCents: capture.taxCents,
        serviceFeeCents: capture.serviceFeeCents,
        tipCents: capture.tipCents,
      },
    });

    expect(allocation.food).toBe(169);
    expect(allocation.tax).toBe(10);
    expect(allocation.serviceFee).toBe(1);
    expect(allocation.tip).toBe(34);

    const walkoutNet = capture.applicationFeeCents - allocation.serviceFee;
    const serverTipNet = capture.tipCents - allocation.tip;
    const foodNet = capture.subtotalCents - allocation.food;
    const taxNet = capture.taxCents - allocation.tax;

    expect(walkoutNet).toBe(24);
    expect(serverTipNet).toBe(966);
    expect(foodNet).toBe(4831);
    expect(taxNet).toBe(290);

    expect(stripeFeeCents + walkoutNet + taxNet + foodNet + serverTipNet).toBe(capture.totalCents);
  });
});
