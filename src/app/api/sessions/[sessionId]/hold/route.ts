import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { auth } from '@/lib/auth';
import { validateUuid } from '@/lib/validate';

const HoldSchema = z.object({
  participantId: z.string().uuid(),
  stripePaymentMethodId: z.string().min(1), // pm_... returned from SetupIntent confirmation
});

/** Rich errors for debugging (dev, preview, or `WALKOUT_PAYMENT_DEBUG=true` on the server). */
function paymentDebugEnabled(): boolean {
  const v = process.env.WALKOUT_PAYMENT_DEBUG?.toLowerCase();
  return (
    process.env.NODE_ENV !== 'production' ||
    v === '1' ||
    v === 'true' ||
    v === 'yes'
  );
}

function stripeErrorDetails(err: {
  type?: string;
  code?: string;
  decline_code?: string;
  message?: string;
  requestId?: string;
  param?: string;
}): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (err.type) out.type = err.type;
  if (err.code) out.code = err.code;
  if (err.decline_code) out.decline_code = err.decline_code;
  if (err.message) out.message = err.message;
  if (err.requestId) out.requestId = err.requestId;
  if (err.param) out.param = err.param;
  return Object.keys(out).length ? out : undefined;
}

/**
 * POST /api/sessions/[sessionId]/hold
 *
 * Places the Stripe auth hold after the SetupIntent payment sheet completes.
 * PRD §11.3: pre-increment holdAttempt BEFORE the Stripe call so the
 * idempotency key is unique on every retry and a partial failure never
 * results in a duplicate charge.
 *
 * Response shapes:
 *   { status: 'held' }                            — hold placed, diner can order
 *   { status: 'requires_action', clientSecret }   — 3DS modal required
 *   { status: 'failed', error: 'Card declined' }  — holdStatus = FAILED, menu blocked
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const invalidSessionId = validateUuid(sessionId, 'sessionId');
  if (invalidSessionId) return invalidSessionId;

  // Auth: anon guest (x-anon-token) or authenticated diner (NextAuth)
  const anonToken = request.headers.get('x-anon-token');
  const nextAuthSession = await auth();

  if (!anonToken && !nextAuthSession?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = HoldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { participantId, stripePaymentMethodId } = parsed.data;

  const invalidParticipantId = validateUuid(participantId, 'participantId');
  if (invalidParticipantId) return invalidParticipantId;

  // Load participant with restaurant data in one query
  const participant = await prisma.tabParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      sessionId: true,
      anonToken: true,
      dinerId: true,
      stripeCustomerId: true,
      holdStatus: true,
      holdAttempt: true,
      session: {
        select: {
          restaurantId: true,
          restaurant: {
            select: {
              stripeConnectAccountId: true,
              stripeConnectOnboarded: true,
              defaultHoldAmount: true,
            },
          },
        },
      },
    },
  });

  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  // Cross-session guard: participant must belong to this session
  if (participant.sessionId !== sessionId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Identity guard: caller must be THIS participant (anon cookie → header, or diner email)
  if (anonToken) {
    if (participant.anonToken !== anonToken) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (nextAuthSession?.user?.email) {
    // Staff must never call this endpoint with arbitrary participantIds
    if (nextAuthSession.user.restaurantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const linked = await prisma.tabParticipant.findFirst({
      where: {
        id: participantId,
        sessionId,
        diner: { email: nextAuthSession.user.email },
      },
      select: { id: true },
    });
    if (!linked) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Idempotency: already held — return success without calling Stripe again
  if (participant.holdStatus === 'HELD') {
    return NextResponse.json({ status: 'held' }, { status: 200 });
  }

  const { restaurant } = participant.session;

  // Restaurant must have completed Stripe Connect onboarding before holds can be placed
  if (!restaurant.stripeConnectAccountId || !restaurant.stripeConnectOnboarded) {
    return NextResponse.json(
      { error: 'Restaurant payment account is not set up' },
      { status: 422 }
    );
  }

  if (!participant.stripeCustomerId) {
    return NextResponse.json(
      { error: 'No payment customer found for this participant' },
      { status: 422 }
    );
  }

  const MIN_HOLD_CENTS = 500;
  const MAX_HOLD_CENTS = 15_000;
  if (
    restaurant.defaultHoldAmount < MIN_HOLD_CENTS ||
    restaurant.defaultHoldAmount > MAX_HOLD_CENTS
  ) {
    console.error('[hold] defaultHoldAmount out of bounds', restaurant.defaultHoldAmount);
    return NextResponse.json({ error: 'Payment configuration error' }, { status: 422 });
  }

  // ── PRD §11.3: Pre-increment holdAttempt BEFORE Stripe call ──────────────
  // The idempotency key includes the counter so retries get a fresh key,
  // preventing duplicate holds if the first call succeeds but the response
  // is lost in transit.
  const newHoldAttempt = participant.holdAttempt + 1;

  await prisma.tabParticipant.update({
    where: { id: participantId },
    data: {
      holdAttempt: newHoldAttempt,
      stripePaymentMethodId,
      holdStatus: 'PENDING',
    },
  });

  // ── Create PaymentIntent with manual capture (auth hold) ──────────────────
  let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>>;

  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: restaurant.defaultHoldAmount,
        currency: 'usd',
        customer: participant.stripeCustomerId,
        payment_method: stripePaymentMethodId,
        capture_method: 'manual',
        confirm: true,
        // User is on-session here (just clicked "Save card & place hold").
        // off_session: true is for later automatic retries, not the first auth hold —
        // sending it now makes Stripe surface non-card errors (e.g. authentication_required)
        // instead of going through the friendly card-decline path.
        metadata: { sessionId, participantId, type: 'auth_hold' },
        // application_fee_amount intentionally omitted — Stripe requires it to be
        // positive when present; fees are taken at capture time, not at hold time (§11.3).
        // on_behalf_of intentionally omitted — this is a direct charge on the
        // connected account (Stripe-Account header), so the merchant of record
        // is already that account.
      },
      {
        idempotencyKey: `hold-${participantId}-${newHoldAttempt}`,
        stripeAccount: restaurant.stripeConnectAccountId,
      }
    );
  } catch (err: unknown) {
    const stripeError = err as {
      type?: string;
      code?: string;
      decline_code?: string;
      param?: string;
      message?: string;
      requestId?: string;
    };

    if (stripeError.type === 'StripeCardError') {
      await prisma.tabParticipant.update({
        where: { id: participantId },
        data: { holdStatus: 'FAILED' },
      });
      const debug = paymentDebugEnabled();
      const details = stripeErrorDetails(stripeError);
      return NextResponse.json(
        {
          status: 'failed',
          error: 'Card declined',
          ...(debug && details ? { details } : {}),
        },
        { status: 402 }
      );
    }

    console.error('[hold] Stripe error', {
      type: stripeError.type,
      code: stripeError.code,
      param: stripeError.param,
      decline_code: stripeError.decline_code,
      requestId: stripeError.requestId,
      message: stripeError.message,
    });

    const debug = paymentDebugEnabled();
    const details = stripeErrorDetails(stripeError);
    return NextResponse.json(
      {
        error: 'Payment processing failed',
        ...(debug && details ? { details } : {}),
      },
      { status: 500 }
    );
  }

  // ── Handle PaymentIntent status ───────────────────────────────────────────

  if (paymentIntent.status === 'succeeded') {
    // Hold placed — diner can now browse the menu and place orders
    await prisma.tabParticipant.update({
      where: { id: participantId },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        holdAmount: restaurant.defaultHoldAmount,
        holdStatus: 'HELD',
      },
    });
    return NextResponse.json({ status: 'held' });
  }

  if (paymentIntent.status === 'requires_action') {
    // 3DS authentication required — return clientSecret for the client to open the modal.
    // holdStatus stays PENDING until the webhook confirms success.
    await prisma.tabParticipant.update({
      where: { id: participantId },
      data: { stripePaymentIntentId: paymentIntent.id },
    });
    return NextResponse.json({
      status: 'requires_action',
      clientSecret: paymentIntent.client_secret,
    });
  }

  // Any other status (requires_payment_method, canceled) — treat as FAILED
  await prisma.tabParticipant.update({
    where: { id: participantId },
    data: { holdStatus: 'FAILED' },
  });
  const debug = paymentDebugEnabled();
  const lpe = paymentIntent.last_payment_error;
  const lpeDetails =
    lpe &&
    stripeErrorDetails({
      code: lpe.code ?? undefined,
      decline_code: lpe.decline_code ?? undefined,
      message: lpe.message ?? undefined,
      type: lpe.type ?? undefined,
    });
  return NextResponse.json(
    {
      status: 'failed',
      error: 'Card declined',
      ...(debug && lpeDetails ? { details: lpeDetails } : {}),
    },
    { status: 402 }
  );
}
