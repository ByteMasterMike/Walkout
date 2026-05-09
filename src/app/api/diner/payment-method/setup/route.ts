import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { getDinerIdFromSession } from '@/lib/diner-session';

export async function POST() {
  const session = await auth();
  const dinerId = getDinerIdFromSession(session);
  if (!dinerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const diner = await prisma.diner.findUniqueOrThrow({
    where: { id: dinerId },
    select: { email: true, name: true, stripeCustomerId: true },
  });

  const stripe = getStripe();
  let customerId = diner.stripeCustomerId;
  if (!customerId) {
    const c = await stripe.customers.create({
      email: diner.email,
      name: diner.name,
    });
    customerId = c.id;
    await prisma.diner.update({
      where: { id: dinerId },
      data: { stripeCustomerId: customerId },
    });
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
    payment_method_options: {
      card: { request_three_d_secure: 'any' },
    },
  });

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  });
}
