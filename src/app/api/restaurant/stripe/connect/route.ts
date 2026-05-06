import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/restaurant/stripe/connect — ADMIN only
 *
 * Creates (or retrieves) a Stripe Express connected account for the restaurant
 * and returns an onboarding link URL. The cofounder's UI redirects the ADMIN
 * to this URL to complete Stripe's hosted onboarding flow (~5 min).
 *
 * After onboarding, Stripe redirects back to the returnUrl with the account ID
 * in the query string. A separate completion route (or webhook) persists
 * stripeConnectAccountId and sets stripeConnectOnboarded = true.
 *
 * PRD §11.3: every PaymentIntent must include on_behalf_of: connectAccountId.
 * Without an onboarded account the hold cannot be created.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.restaurantId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: {
      id: true,
      name: true,
      email: true,
      stripeConnectAccountId: true,
      stripeConnectOnboarded: true,
    },
  });

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  const origin = request.headers.get('origin') ?? process.env.NEXTAUTH_URL ?? 'https://walkoutofficial.com';

  let accountId = restaurant.stripeConnectAccountId;

  // Create a new Express account if one doesn't exist yet
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: restaurant.email,
      metadata: { restaurantId: restaurant.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: restaurant.name,
        mcc: '5812', // Eating Places, Restaurants
      },
    });

    accountId = account.id;

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { stripeConnectAccountId: accountId },
    });
  }

  // Generate a fresh onboarding link (these expire after a few minutes)
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard/setup/stripe?refresh=1`,
    return_url: `${origin}/dashboard/setup/stripe?success=1`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
