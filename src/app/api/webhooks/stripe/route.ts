import { createElement } from 'react';
import { NextResponse } from 'next/server';
import { render } from '@react-email/render';
import Stripe from 'stripe';
import CaptureFailedEmail from '@/emails/CaptureFailedEmail';
import { sendUrgentNotification } from '@/lib/notify/sendUrgent';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import {
  finalizeHoldCaptureFromPaymentIntent,
  finalizeOverflowCaptureFromPaymentIntent,
} from '@/lib/payment/finalizeHoldCapture';
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
        await finalizeOverflowCaptureFromPaymentIntent(paymentIntent);
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
        await finalizeHoldCaptureFromPaymentIntent(paymentIntent);
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
