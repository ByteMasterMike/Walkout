import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { getDinerIdFromSession } from '@/lib/diner-session';

const Schema = z.object({
  paymentMethodId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  const dinerId = getDinerIdFromSession(session);
  if (!dinerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const diner = await prisma.diner.findUniqueOrThrow({
    where: { id: dinerId },
    select: { stripeCustomerId: true },
  });

  if (!diner.stripeCustomerId) {
    return NextResponse.json({ error: 'Run payment setup first' }, { status: 422 });
  }

  const stripe = getStripe();
  const pmId = parsed.data.paymentMethodId;

  await stripe.paymentMethods.attach(pmId, { customer: diner.stripeCustomerId });
  await stripe.customers.update(diner.stripeCustomerId, {
    invoice_settings: { default_payment_method: pmId },
  });

  await prisma.diner.update({
    where: { id: dinerId },
    data: { stripeDefaultPaymentMethodId: pmId },
  });

  return NextResponse.json({ ok: true });
}
