import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { stripe, STRIPE_PAYMENT_INTENT_CARD_ONLY } from '@/lib/stripe';
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

/** Redact Stripe-style ids so we can safely surface API messages in production. */
function redactStripeIds(input: string): string {
  return input.replace(
    /\b(?:cus|acct|pm|pi|card|tok|seti|sess|req|src|link|bank|card)_[A-Za-z0-9]+\b/gi,
    '[redacted]'
  );
}

/**
 * Normalize Stripe Node SDK throws. `error.raw` IS the API error object (`invalid_request_error`, …);
 * RequestSender also merges `headers`, `statusCode`, and `requestId` onto that same object (camelCase).
 */
function normalizeStripeThrown(err: unknown): {
  /** `StripeCardError` / `StripeInvalidRequestError` — use for branching only */
  sdkClassName?: string;
  /** Stripe API `type`, e.g. `invalid_request_error` */
  apiErrorType?: string;
  code?: string;
  decline_code?: string;
  message?: string;
  requestId?: string;
  param?: string;
  detail?: string;
  doc_url?: string;
  statusCode?: number;
} {
  if (!err || typeof err !== 'object') return {};
  const e = err as Record<string, unknown>;

  let rawObj: Record<string, unknown> | undefined;
  if (typeof e.raw === 'object' && e.raw !== null && !Array.isArray(e.raw)) {
    rawObj = e.raw as Record<string, unknown>;
  } else if (typeof e.raw === 'string') {
    try {
      const parsed = JSON.parse(e.raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) rawObj = parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }

  const oauthNested =
    rawObj?.error && typeof rawObj.error === 'object' && !Array.isArray(rawObj.error)
      ? (rawObj.error as Record<string, unknown>)
      : undefined;

  const sources: Record<string, unknown>[] = [e];
  if (rawObj) sources.push(rawObj);
  if (oauthNested) sources.push(oauthNested);

  const pickStrKeys = (keys: string[]) => {
    for (const key of keys) {
      for (const s of sources) {
        const v = s[key];
        if (typeof v === 'string' && v.length > 0) return v;
      }
    }
    return undefined;
  };

  const pickNumKeys = (keys: string[]) => {
    for (const key of keys) {
      for (const s of sources) {
        const v = s[key];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
    }
    return undefined;
  };

  const sdkClassName = typeof e.type === 'string' && e.type.length > 0 ? e.type : undefined;
  const apiErrorType =
    (typeof e.rawType === 'string' && e.rawType.length > 0 ? e.rawType : undefined) ??
    (rawObj && typeof rawObj.type === 'string' ? rawObj.type : undefined) ??
    (oauthNested && typeof oauthNested.type === 'string' ? oauthNested.type : undefined);

  return {
    sdkClassName,
    apiErrorType,
    code: pickStrKeys(['code']),
    decline_code: pickStrKeys(['decline_code']),
    message: pickStrKeys(['message']),
    requestId: pickStrKeys(['requestId', 'request_id']),
    param: pickStrKeys(['param']),
    detail: pickStrKeys(['detail']),
    doc_url: pickStrKeys(['doc_url']),
    statusCode: pickNumKeys(['statusCode', 'status']),
  };
}

/** Stripe codes/types are safe to surface to the browser; raw messages may embed ids — gate those separately. */
function stripeDiagnostics(
  err: {
    /** Prefer Stripe API type (`invalid_request_error`) over SDK class name */
    diagnosticType?: string;
    code?: string;
    decline_code?: string;
    message?: string;
    requestId?: string;
    param?: string;
    detail?: string;
    doc_url?: string;
    statusCode?: number;
  },
  opts: {
    verbose: boolean;
    /** Card-style failures: show full Stripe message (already customer-facing). */
    exposeStripeMessage: boolean;
  }
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (err.diagnosticType) out.type = err.diagnosticType;
  if (err.code) out.code = err.code;
  if (err.decline_code) out.decline_code = err.decline_code;
  if (err.param) out.param = err.param;
  if (err.detail) out.detail = err.detail;
  if (err.doc_url) out.doc_url = err.doc_url;
  if (err.statusCode != null) out.httpStatus = String(err.statusCode);
  if (err.requestId) out.requestId = err.requestId;

  const msg = err.message?.trim();
  if (msg) {
    if (opts.verbose || opts.exposeStripeMessage) out.message = msg;
    else out.message = redactStripeIds(msg);
  }

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
 *   { status: 'failed', error: 'Card declined', details?: { type, code, … } } — optional Stripe diagnostics
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
        ...STRIPE_PAYMENT_INTENT_CARD_ONLY,
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
    const stripeError = normalizeStripeThrown(err);

    if (stripeError.sdkClassName === 'StripeCardError') {
      await prisma.tabParticipant.update({
        where: { id: participantId },
        data: { holdStatus: 'FAILED' },
      });
      const verbose = paymentDebugEnabled();
      const details = stripeDiagnostics(
        {
          ...stripeError,
          diagnosticType: stripeError.apiErrorType ?? stripeError.sdkClassName,
        },
        {
          verbose,
          exposeStripeMessage: true,
        },
      );
      return NextResponse.json(
        {
          status: 'failed',
          error: 'Card declined',
          ...(details ? { details } : {}),
        },
        { status: 402 }
      );
    }

    console.error('[hold] Stripe error', {
      sdkClassName: stripeError.sdkClassName,
      apiErrorType: stripeError.apiErrorType,
      code: stripeError.code,
      param: stripeError.param,
      decline_code: stripeError.decline_code,
      requestId: stripeError.requestId,
      message: stripeError.message,
    });

    const verbose = paymentDebugEnabled();
    const details = stripeDiagnostics(
      {
        ...stripeError,
        diagnosticType: stripeError.apiErrorType ?? stripeError.sdkClassName,
      },
      {
        verbose,
        exposeStripeMessage: false,
      },
    );
    return NextResponse.json(
      {
        error: 'Payment processing failed',
        ...(details ? { details } : {}),
      },
      { status: 500 }
    );
  }

  // ── Handle PaymentIntent status ───────────────────────────────────────────

  // Manual capture: a successful authorization is `requires_capture`, not `succeeded`.
  // Treat both as HELD so we don't mis-classify a good auth-hold as "Card declined".
  if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture') {
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
  const verbose = paymentDebugEnabled();
  const lpe = paymentIntent.last_payment_error;
  const lpeDetails =
    lpe &&
    stripeDiagnostics(
      {
        diagnosticType: typeof lpe.type === 'string' ? lpe.type : undefined,
        code: lpe.code ?? undefined,
        decline_code: lpe.decline_code ?? undefined,
        message: lpe.message ?? undefined,
      },
      { verbose, exposeStripeMessage: true },
    );
  return NextResponse.json(
    {
      status: 'failed',
      error: 'Card declined',
      ...(lpeDetails ? { details: lpeDetails } : {}),
    },
    { status: 402 }
  );
}
