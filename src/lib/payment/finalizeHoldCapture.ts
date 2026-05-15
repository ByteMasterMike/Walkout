import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { allocateFee } from '@/lib/payment/capture';
import { notifyCaptureSucceeded } from '@/lib/notify/captureReceipt';

/**
 * Persists CAPTURED state, fee splits, and tip attribution after the hold PI succeeds (PRD 17.8).
 * Shared by Stripe webhooks and synchronous reconcile after `paymentIntents.capture`.
 *
 * @returns true if participant rows were updated; false if idempotent no-op.
 */
export async function finalizeHoldCaptureFromPaymentIntent(
  pi: Stripe.PaymentIntent,
): Promise<boolean> {
  const participant = await prisma.tabParticipant.findFirst({
    where: { stripePaymentIntentId: pi.id },
    select: {
      id: true,
      captureStatus: true,
      subtotalCents: true,
      taxCents: true,
      serviceFeeCents: true,
      resolvedTipAmount: true,
      session: {
        select: {
          assignedStaffId: true,
          restaurantId: true,
          restaurant: {
            select: {
              stripeConnectAccountId: true,
              tipDistributionMode: true,
            },
          },
        },
      },
    },
  });

  if (!participant || participant.captureStatus === 'CAPTURED') return false;

  if ((pi.amount_received ?? 0) <= 0) return false;

  const { session } = participant;
  const { restaurant } = session;

  const chargeId =
    typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;

  if (!chargeId) return false;

  const charge = await stripe.charges.retrieve(
    chargeId,
    { expand: ['balance_transaction'] },
    { stripeAccount: restaurant.stripeConnectAccountId ?? undefined },
  );

  const balanceTx = charge.balance_transaction as Stripe.BalanceTransaction | null;
  const stripeFeeCents = balanceTx?.fee ?? 0;

  const tipAmountCents = participant.resolvedTipAmount ?? 0;

  const allocation = allocateFee({
    totalFeeCents: stripeFeeCents,
    components: {
      foodCents: participant.subtotalCents ?? 0,
      taxCents: participant.taxCents ?? 0,
      serviceFeeCents: participant.serviceFeeCents ?? 0,
      tipCents: tipAmountCents,
    },
  });

  const tipAttributionData: {
    tipAssignedToStaffId?: string | null;
    tipPoolId?: string | null;
  } = {};

  if (restaurant.tipDistributionMode === 'DIRECT') {
    tipAttributionData.tipAssignedToStaffId = session.assignedStaffId ?? null;
  } else if (restaurant.tipDistributionMode === 'POOL' && tipAmountCents > 0) {
    let pool = await prisma.tipPool.findFirst({
      where: { restaurantId: session.restaurantId, status: 'OPEN' },
      select: { id: true },
    });

    if (!pool) {
      try {
        pool = await prisma.tipPool.create({
          data: { restaurantId: session.restaurantId, status: 'OPEN', shiftDate: new Date() },
          select: { id: true },
        });
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code !== 'P2002') throw err;
        pool = await prisma.tipPool.findFirstOrThrow({
          where: { restaurantId: session.restaurantId, status: 'OPEN' },
          select: { id: true },
        });
      }
    }

    tipAttributionData.tipPoolId = pool.id;
  }

  const participantUpdate = prisma.tabParticipant.update({
    where: { id: participant.id },
    data: {
      captureStatus: 'CAPTURED',
      capturedAt: new Date(),
      capturedAmount: pi.amount_received ?? pi.amount,
      holdStatus: 'RELEASED',
      feeAllocatedToFoodCents: allocation.food,
      feeAllocatedToTaxCents: allocation.tax,
      feeAllocatedToServiceFeeCents: allocation.serviceFee,
      feeAllocatedToTipCents: allocation.tip,
      tipStatus: 'RESOLVED',
      ...tipAttributionData,
    },
  });

  if (tipAttributionData.tipPoolId && tipAmountCents > 0) {
    const poolId = tipAttributionData.tipPoolId;
    await prisma.$transaction([
      prisma.tipPoolEntry.create({
        data: {
          poolId,
          participantId: participant.id,
          staffId: session.assignedStaffId ?? null,
          amountCents: tipAmountCents,
        },
      }),
      prisma.tipPool.update({
        where: { id: poolId },
        data: { totalAmountCents: { increment: tipAmountCents } },
      }),
      participantUpdate,
    ]);
  } else {
    await participantUpdate;
  }

  await notifyCaptureSucceeded(participant.id, pi.amount_received ?? pi.amount ?? 0);
  return true;
}

/**
 * After overflow PI succeeds: mark overflow captured and allocate overflow Stripe fee share to tip bucket.
 */
export async function finalizeOverflowCaptureFromPaymentIntent(
  pi: Stripe.PaymentIntent,
): Promise<boolean> {
  const participant = await prisma.tabParticipant.findFirst({
    where: { overflowPaymentIntentId: pi.id },
    select: {
      id: true,
      overflowStatus: true,
      resolvedTipAmount: true,
      overflowAmount: true,
      session: {
        select: {
          restaurant: { select: { stripeConnectAccountId: true } },
        },
      },
    },
  });

  if (!participant || participant.overflowStatus === 'CAPTURED') return false;

  const stripeAccount = participant.session.restaurant.stripeConnectAccountId ?? undefined;
  const chargeId =
    typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;

  let tipFeeIncrement = 0;
  if (chargeId && stripeAccount) {
    const charge = await stripe.charges.retrieve(
      chargeId,
      { expand: ['balance_transaction'] },
      { stripeAccount },
    );
    const balanceTx = charge.balance_transaction as Stripe.BalanceTransaction | null;
    const overflowFeeCents = balanceTx?.fee ?? 0;
    const overflowAmt = participant.overflowAmount ?? pi.amount ?? 0;
    const tipCents = participant.resolvedTipAmount ?? 0;
    if (overflowAmt > 0 && overflowFeeCents > 0 && tipCents > 0) {
      tipFeeIncrement = Math.round((tipCents / overflowAmt) * overflowFeeCents);
    }
  }

  await prisma.tabParticipant.update({
    where: { id: participant.id },
    data: {
      overflowStatus: 'CAPTURED',
      ...(tipFeeIncrement > 0 ? { feeAllocatedToTipCents: { increment: tipFeeIncrement } } : {}),
    },
  });

  return true;
}
