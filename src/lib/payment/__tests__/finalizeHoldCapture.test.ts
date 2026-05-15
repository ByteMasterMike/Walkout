import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tabParticipant: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    charges: {
      retrieve: vi.fn(),
    },
  },
}));

vi.mock('@/lib/notify/captureReceipt', () => ({
  notifyCaptureSucceeded: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { finalizeHoldCaptureFromPaymentIntent } from '@/lib/payment/finalizeHoldCapture';

beforeEach(() => {
  vi.mocked(prisma.tabParticipant.findFirst).mockReset();
  vi.mocked(prisma.$transaction).mockReset();
  vi.mocked(stripe.charges.retrieve).mockReset();
});

describe('finalizeHoldCaptureFromPaymentIntent', () => {
  it('returns false idempotently when participant already CAPTURED', async () => {
    vi.mocked(prisma.tabParticipant.findFirst).mockResolvedValue({
      captureStatus: 'CAPTURED',
      id: 'p1',
    } as never);

    const pi = {
      id: 'pi_1',
      amount_received: 5000,
      latest_charge: 'ch_1',
    } as never;

    await expect(finalizeHoldCaptureFromPaymentIntent(pi)).resolves.toBe(false);
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it('returns false when no participant row matches the PI', async () => {
    vi.mocked(prisma.tabParticipant.findFirst).mockResolvedValue(null);

    const pi = {
      id: 'pi_unknown',
      amount_received: 100,
      latest_charge: 'ch_1',
    } as never;

    await expect(finalizeHoldCaptureFromPaymentIntent(pi)).resolves.toBe(false);
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it('returns false when amount_received is zero', async () => {
    vi.mocked(prisma.tabParticipant.findFirst).mockResolvedValue({
      id: 'p1',
      captureStatus: 'PROCESSING',
      subtotalCents: 100,
      taxCents: 0,
      serviceFeeCents: 0,
      resolvedTipAmount: 0,
      session: {
        assignedStaffId: null,
        restaurantId: 'r1',
        restaurant: {
          stripeConnectAccountId: 'acct_1',
          tipDistributionMode: 'DIRECT',
        },
      },
    } as never);

    const pi = {
      id: 'pi_1',
      amount_received: 0,
      latest_charge: 'ch_1',
    } as never;

    await expect(finalizeHoldCaptureFromPaymentIntent(pi)).resolves.toBe(false);
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it('returns false when latest_charge is missing', async () => {
    vi.mocked(prisma.tabParticipant.findFirst).mockResolvedValue({
      id: 'p1',
      captureStatus: 'PROCESSING',
      subtotalCents: 100,
      taxCents: 0,
      serviceFeeCents: 0,
      resolvedTipAmount: 0,
      session: {
        assignedStaffId: null,
        restaurantId: 'r1',
        restaurant: {
          stripeConnectAccountId: 'acct_1',
          tipDistributionMode: 'DIRECT',
        },
      },
    } as never);

    const pi = {
      id: 'pi_1',
      amount_received: 500,
      latest_charge: null,
    } as never;

    await expect(finalizeHoldCaptureFromPaymentIntent(pi)).resolves.toBe(false);
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });
});
