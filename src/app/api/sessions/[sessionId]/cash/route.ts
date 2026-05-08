import Decimal from 'decimal.js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { generateCashReceiptXml } from '@/lib/cloudprint/receipt';
import { prisma } from '@/lib/prisma';
import { enforceCashLimit } from '@/lib/rate-limit';
import { stripe } from '@/lib/stripe';
import { validateUuid } from '@/lib/validate';

const BodySchema = z.object({
  participantId: z.string().uuid(),
});

const CANCELABLE_PI_STATUSES = new Set([
  'requires_capture',
  'requires_confirmation',
  'requires_action',
  'requires_payment_method',
]);

/**
 * POST /api/sessions/[sessionId]/cash
 *
 * Switch participant to cash payment: cancel Stripe hold, mark orders CASH_PENDING,
 * queue CloudPRNT receipt. Callable by staff (dashboard) or the guest (anon / diner).
 * Must live under /api/sessions so guest middleware forwards `tabs_anon` (not under /api/restaurant).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const invalidSessionId = validateUuid(sessionId, 'sessionId');
  if (invalidSessionId) return invalidSessionId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { participantId } = parsed.data;

  const invalidParticipantId = validateUuid(participantId, 'participantId');
  if (invalidParticipantId) return invalidParticipantId;

  const rateLimited = await enforceCashLimit(participantId);
  if (rateLimited) return rateLimited;

  const anonToken = request.headers.get('x-anon-token');
  const nextAuthSession = await auth();

  const participant = await prisma.tabParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      sessionId: true,
      anonToken: true,
      dinerId: true,
      stripePaymentIntentId: true,
      holdStatus: true,
      isCashPayment: true,
      session: {
        select: {
          id: true,
          status: true,
          restaurantId: true,
          tableId: true,
          table: { select: { tableNumber: true } },
          restaurant: {
            select: {
              id: true,
              name: true,
              taxLabel: true,
              taxRate: true,
              stripeConnectAccountId: true,
            },
          },
        },
      },
    },
  });

  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  if (participant.sessionId !== sessionId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Authorization: staff OR this guest participant
  const staffRestaurantId = nextAuthSession?.user?.restaurantId;
  if (staffRestaurantId) {
    if (participant.session.restaurantId !== staffRestaurantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (anonToken) {
    if (participant.anonToken !== anonToken) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (nextAuthSession?.user?.email && !staffRestaurantId) {
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (participant.session.status !== 'OPEN') {
    return NextResponse.json(
      { error: 'Session must be open to switch to cash' },
      { status: 422 },
    );
  }

  if (participant.isCashPayment) {
    return NextResponse.json({ error: 'Already marked as cash payment' }, { status: 409 });
  }

  const restaurant = participant.session.restaurant;
  const connectId = restaurant.stripeConnectAccountId;

  if (!participant.stripePaymentIntentId) {
    return NextResponse.json(
      { error: 'No card hold to cancel — add a card on the join screen first' },
      { status: 422 },
    );
  }

  if (!connectId) {
    return NextResponse.json(
      { error: 'Restaurant payment setup incomplete' },
      { status: 422 },
    );
  }

  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
  try {
    pi = await stripe.paymentIntents.retrieve(participant.stripePaymentIntentId, {
      stripeAccount: connectId,
    });
  } catch {
    return NextResponse.json({ error: 'Could not verify payment hold' }, { status: 502 });
  }

  if (pi.status === 'succeeded' || pi.status === 'processing') {
    return NextResponse.json({ error: 'Card payment already completed' }, { status: 409 });
  }

  const claim = await prisma.tabParticipant.updateMany({
    where: { id: participantId, sessionId, isCashPayment: false },
    data: { isCashPayment: true },
  });

  if (claim.count === 0) {
    return NextResponse.json({ error: 'Already marked as cash payment' }, { status: 409 });
  }

  const shouldCancel = pi.status !== 'canceled' && CANCELABLE_PI_STATUSES.has(pi.status);

  if (shouldCancel) {
    try {
      await stripe.paymentIntents.cancel(participant.stripePaymentIntentId, {
        stripeAccount: connectId,
      });
    } catch {
      await prisma.tabParticipant.updateMany({
        where: { id: participantId, sessionId, isCashPayment: true },
        data: { isCashPayment: false },
      });
      return NextResponse.json({ error: 'Could not switch to cash' }, { status: 502 });
    }
  }

  const orders = await prisma.orderItem.findMany({
    where: { participantId, sessionId },
    include: {
      menuItem: { select: { name: true } },
    },
  });

  const xml = generateCashReceiptXml(
    {
      name: restaurant.name,
      taxLabel: restaurant.taxLabel,
      taxRate: new Decimal(restaurant.taxRate.toString()),
    },
    {
      tableNumber: participant.session.table.tableNumber,
    },
    orders.map((o) => ({
      quantity: o.quantity,
      menuItemName: o.menuItem.name,
      unitPrice: new Decimal(o.unitPrice.toString()),
      taxAmount: new Decimal(o.taxAmount.toString()),
      status: o.status,
    })),
  );

  await prisma.$transaction([
    prisma.tabParticipant.update({
      where: { id: participantId },
      data: {
        isCashPayment: true,
        holdStatus: 'RELEASED',
        captureStatus: 'SKIPPED',
      },
    }),
    prisma.orderItem.updateMany({
      where: {
        participantId,
        sessionId,
        status: { notIn: ['CANCELLED', 'CASH_PENDING'] },
      },
      data: { status: 'CASH_PENDING' },
    }),
    prisma.printJob.create({
      data: {
        restaurantId: restaurant.id,
        type: 'CASH_RECEIPT',
        status: 'QUEUED',
        content: Buffer.from(xml, 'utf8'),
        metadata: {
          participantId,
          sessionId,
          tableNumber: participant.session.table.tableNumber,
          kind: 'cash_receipt',
        },
      },
    }),
    prisma.tabSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
