import { createElement } from 'react';
import { NextResponse } from 'next/server';
import { render } from '@react-email/render';
import Stripe from 'stripe';
import CaptureFailedEmail from '@/emails/CaptureFailedEmail';
import { notifyCaptureSucceeded } from '@/lib/notify/captureReceipt';
import { sendUrgentNotification } from '@/lib/notify/sendUrgent';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { allocateFee } from '@/lib/payment/capture';
import { applyConnectAccountUpdate } from '@/lib/stripe/refreshConnectStatus';

function appUrl(): string {
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}

function formatMoneyFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * POST /api/webhooks/stripe
 *
 * CRITICAL: request.text() MUST be called first — before any parsing.
 * Any body-parsing middleware or request.json() before constructEvent
 * breaks Stripe signature verification (MICHAEL.md invariant).
 *
 * Handles:
 *   payment_intent.succeeded   — auth_hold (3DS), capture, overflow
 *   payment_intent.payment_failed — surface in Pending Settlements
 */
export async function POST(request: Request) {
  // ── 1. Raw body FIRST — signature verification requires unchanged bytes ──
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 401 });
  }

  // ── 2. Route on event type ────────────────────────────────────────────────
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metaType = paymentIntent.metadata?.type;

      if (metaType === 'overflow') {
        await handleOverflowSucceeded(paymentIntent);
        break;
      }

      // Same PaymentIntent id is used from auth hold through capture; metadata.type stays auth_hold/reauth.
      const captureCandidate = await prisma.tabParticipant.findFirst({
        where: { stripePaymentIntentId: paymentIntent.id },
        select: { captureStatus: true },
      });

      if (
        captureCandidate?.captureStatus === 'PROCESSING' &&
        (paymentIntent.amount_received ?? 0) > 0
      ) {
        await handleCaptureSucceeded(paymentIntent);
        break;
      }

      if (metaType === 'auth_hold' || metaType === 'reauth') {
        await handleAuthHoldSucceeded(paymentIntent);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentFailed(paymentIntent);
      break;
    }

    case 'account.updated': {
      // Sent for the platform account and (when "events on Connect accounts"
      // is enabled in the webhook config) for connected Express accounts.
      // Keeps `Restaurant.stripeConnectOnboarded` in sync without polling.
      const account = event.data.object as Stripe.Account;
      await applyConnectAccountUpdate(account);
      break;
    }

    default:
      // All other events: acknowledge and ignore — return 200 to stop retries
      break;
  }

  return NextResponse.json({ received: true });
}

// ============================================================================
// Handler: auth_hold succeeded (3DS modal completed by diner)
// ============================================================================

async function handleAuthHoldSucceeded(pi: Stripe.PaymentIntent) {
  // Hold route already persisted the PI id with holdStatus = PENDING.
  // This webhook makes the hold official after 3DS confirmation.
  const existing = await prisma.tabParticipant.findFirst({
    where: { stripePaymentIntentId: pi.id },
    select: { id: true, holdStatus: true },
  });

  if (!existing || existing.holdStatus === 'HELD') return; // idempotent

  await prisma.tabParticipant.update({
    where: { id: existing.id },
    data: {
      holdStatus: 'HELD',
      holdAmount: pi.amount,
    },
  });
}

// ============================================================================
// Handler: capture succeeded — the main post-capture webhook
// ============================================================================

async function handleCaptureSucceeded(pi: Stripe.PaymentIntent) {
  // ── Step 1: Idempotency guard ─────────────────────────────────────────────
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
              absorbTipProcessingFee: true,
            },
          },
        },
      },
    },
  });

  if (!participant || participant.captureStatus === 'CAPTURED') return;

  const { session } = participant;
  const { restaurant } = session;

  // ── Step 2: Retrieve the actual Stripe fee from the balance transaction ───
  const chargeId =
    typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;

  if (!chargeId) return; // no charge attached — nothing to allocate

  const charge = await stripe.charges.retrieve(
    chargeId,
    { expand: ['balance_transaction'] },
    // Scope to the restaurant's connected account
    { stripeAccount: restaurant.stripeConnectAccountId ?? undefined }
  );

  const balanceTx = charge.balance_transaction as Stripe.BalanceTransaction | null;
  const stripeFeeCents = balanceTx?.fee ?? 0;

  // ── Step 3: Pro-rata fee allocation (§17.8) ────────────────────────────────
  // Uses the proven allocateFee() — all 20 TDD tests green for this function.
  const tipAmountCents = participant.resolvedTipAmount ?? 0;

  const allocation = allocateFee({
    totalFeeCents: stripeFeeCents,
    components: {
      foodCents:       participant.subtotalCents ?? 0,
      taxCents:        participant.taxCents ?? 0,
      serviceFeeCents: participant.serviceFeeCents ?? 0,
      tipCents:        tipAmountCents,
    },
  });

  // ── Step 4: Tip attribution (DIRECT vs POOL) ──────────────────────────────
  const tipAttributionData: {
    tipAssignedToStaffId?: string | null;
    tipPoolId?: string | null;
  } = {};

  if (restaurant.tipDistributionMode === 'DIRECT') {
    tipAttributionData.tipAssignedToStaffId = session.assignedStaffId ?? null;
  } else if (restaurant.tipDistributionMode === 'POOL' && tipAmountCents > 0) {
    // Concurrency-safe pool upsert per PRD §17.4.
    // Partial unique index `one_open_pool_per_restaurant` guarantees at-most-one OPEN pool.
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
        // Lost the creation race — re-fetch the winner
        pool = await prisma.tipPool.findFirstOrThrow({
          where: { restaurantId: session.restaurantId, status: 'OPEN' },
          select: { id: true },
        });
      }
    }

    // Pool-entry and participant update are bundled into step 5's transaction below.
    tipAttributionData.tipPoolId = pool.id;
  }

  // ── Step 5: Persist all capture fields + tip pool entry atomically ─────────
  // Pool-entry write and captureStatus update are in ONE transaction so a
  // Stripe webhook retry in the gap between steps cannot create a duplicate
  // TipPoolEntry and inflate TipPool.totalAmountCents (security HIGH finding).
  const participantUpdate = prisma.tabParticipant.update({
    where: { id: participant.id },
    data: {
      captureStatus:                 'CAPTURED',
      capturedAt:                    new Date(),
      capturedAmount:                pi.amount_received ?? pi.amount,
      holdStatus:                    'RELEASED',
      feeAllocatedToFoodCents:       allocation.food,
      feeAllocatedToTaxCents:        allocation.tax,
      feeAllocatedToServiceFeeCents: allocation.serviceFee,
      feeAllocatedToTipCents:        allocation.tip,
      tipStatus:                     'RESOLVED',
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
          staffId:       session.assignedStaffId ?? null,
          amountCents:   tipAmountCents,
        },
      }),
      prisma.tipPool.update({
        where: { id: poolId },
        data:  { totalAmountCents: { increment: tipAmountCents } },
      }),
      participantUpdate,
    ]);
  } else {
    await participantUpdate;
  }

  await notifyCaptureSucceeded(participant.id, pi.amount_received ?? pi.amount ?? 0);

  // ── Step 6: Receipt (handled by notifyCaptureSucceeded) ───────────────────
}

// ============================================================================
// Handler: overflow PI succeeded
// ============================================================================

async function handleOverflowSucceeded(pi: Stripe.PaymentIntent) {
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

  if (!participant || participant.overflowStatus === 'CAPTURED') return;

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
      ...(tipFeeIncrement > 0
        ? { feeAllocatedToTipCents: { increment: tipFeeIncrement } }
        : {}),
    },
  });
}

// ============================================================================
// Handler: payment_intent.payment_failed
// ============================================================================

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const participants = await prisma.tabParticipant.findMany({
    where: {
      OR: [{ stripePaymentIntentId: pi.id }, { overflowPaymentIntentId: pi.id }],
    },
    include: {
      diner: true,
      session: {
        include: {
          restaurant: { select: { name: true } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const amountCents = pi.amount ?? 0;

  for (const p of participants) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);

    const payUrl = `${appUrl()}/tab/${p.sessionId}/pay`;
    const restaurantName = p.session.restaurant.name;

    const emailHtml = await render(
      createElement(CaptureFailedEmail, {
        restaurantName,
        amount: formatMoneyFromCents(amountCents),
        payUrl,
      }),
    );

    await sendUrgentNotification({
      email: p.diner?.email,
      phoneE164: p.diner?.phone ?? undefined,
      pushSubscription: p.diner?.pushSubscription,
      emailSubject: `Payment didn't go through — ${restaurantName}`,
      emailHtml,
      push: {
        title: `${restaurantName}`,
        body: `We couldn't charge ${formatMoneyFromCents(amountCents)}. Tap to pay.`,
        url: payUrl,
      },
      smsBody: p.diner?.phone
        ? `WalkOut: Your last meal payment didn't go through. Tap to retry: ${payUrl}`
        : undefined,
    });
  }

  await prisma.tabParticipant.updateMany({
    where: {
      stripePaymentIntentId: pi.id,
      captureStatus: { not: 'CAPTURED' },
    },
    data: { captureStatus: 'FAILED' },
  });

  await prisma.tabParticipant.updateMany({
    where: {
      overflowPaymentIntentId: pi.id,
      overflowStatus: { not: 'CAPTURED' },
    },
    data: { overflowStatus: 'FAILED' },
  });
}
