import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { cookies } from 'next/headers';
import { validateUuid } from '@/lib/validate';
import { assignServerToSession } from '@/lib/session';

const JoinSchema = z.object({
  displayName: z.string().min(1).max(60),
  dietaryNotes: z.string().max(200).optional(),
  smsSmsOptIn: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ nfcTagId: string }> }
) {
  const { nfcTagId } = await params;

  const invalidNfcTagId = validateUuid(nfcTagId, 'nfcTagId')
  if (invalidNfcTagId) return invalidNfcTagId

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { displayName, dietaryNotes } = parsed.data;

  // Resolve table and restaurant together — need Connect account ID for SetupIntent
  const tableWithRestaurant = await prisma.diningTable.findUnique({
    where: { nfcTagId },
    select: {
      id: true,
      restaurantId: true,
      isActive: true,
      restaurant: {
        select: {
          stripeConnectAccountId: true,
          stripeConnectOnboarded: true,
        },
      },
    },
  });

  const table = tableWithRestaurant
    ? {
        id: tableWithRestaurant.id,
        restaurantId: tableWithRestaurant.restaurantId,
        isActive: tableWithRestaurant.isActive,
        stripeConnectAccountId: tableWithRestaurant.restaurant.stripeConnectAccountId,
        stripeConnectOnboarded: tableWithRestaurant.restaurant.stripeConnectOnboarded,
      }
    : null;

  if (!table || !table.isActive) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  // Race-condition-safe session creation: try to find active session first,
  // then create one if none exists, catching P2002 from the partial unique index.
  let session = await prisma.tabSession.findFirst({
    where: { tableId: table.id, status: { in: ['OPEN', 'AWAITING_TIP', 'CAPTURING', 'CLOSING'] } },
    select: { id: true, hostParticipantId: true },
  });

  if (!session) {
    try {
      session = await prisma.tabSession.create({
        data: { tableId: table.id, restaurantId: table.restaurantId },
        select: { id: true, hostParticipantId: true },
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation from `one_active_session_per_table` index
      const isUniqueViolation =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002';

      if (isUniqueViolation) {
        // Re-fetch the session that won the race
        session = await prisma.tabSession.findFirst({
          where: { tableId: table.id, status: { in: ['OPEN', 'AWAITING_TIP', 'CAPTURING', 'CLOSING'] } },
          select: { id: true, hostParticipantId: true },
        });
      }

      if (!session) {
        return NextResponse.json({ error: 'Could not create session' }, { status: 500 });
      }
    }
  }

  // Create anonymous token and AnonSession record
  const anonToken = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.anonSession.create({ data: { token: anonToken, expiresAt } });

  const isHost = !session.hostParticipantId;

  const participant = await prisma.tabParticipant.create({
    data: {
      sessionId: session.id,
      anonToken,
      displayName,
      dietaryNotes,
      isHost,
    },
    select: { id: true },
  });

  // Update hostParticipantId if this is the first participant
  if (isHost) {
    await prisma.tabSession.update({
      where: { id: session.id },
      data: { hostParticipantId: participant.id },
    });
  }

  // Assign the active server for this table (best-effort, no error on miss)
  try {
    await assignServerToSession(session.id, table.restaurantId);
  } catch {
    // Best-effort: a transient DB error should not block the NFC tap.
    // Missing assignment shows "Unassigned" warning in dashboard UI.
  }

  // ── Stripe SetupIntent (§11.2) ──────────────────────────────────────────
  // Create a Stripe Customer + SetupIntent so the diner can save a card
  // for the off-session auth hold that fires immediately after setup.
  // Only created when the restaurant has a connected Stripe account.
  let setupClientSecret: string | null = null;

  if (table.stripeConnectAccountId && table.stripeConnectOnboarded) {
    try {
      // Create a Stripe Customer to store the payment method off-session
      const customer = await stripe.customers.create(
        {
          metadata: {
            participantId: participant.id,
            sessionId: session.id,
            restaurantId: table.restaurantId,
          },
        },
        // Scope the customer to the restaurant's connected account
        { stripeAccount: table.stripeConnectAccountId }
      );

      // SetupIntent with 3DS forced during setup (§11.2):
      // request_three_d_secure: 'any' gets the bank to grant off-session exemption
      // so future automatic captures don't require user interaction.
      const setupIntent = await stripe.setupIntents.create(
        {
          customer: customer.id,
          usage: 'off_session',
          payment_method_types: ['card'],
          payment_method_options: {
            card: { request_three_d_secure: 'any' },
          },
          metadata: {
            sessionId: session.id,
            participantId: participant.id,
            restaurantId: table.restaurantId,
          },
        },
        { stripeAccount: table.stripeConnectAccountId }
      );

      // Persist the Stripe Customer ID on the participant so the hold route
      // can retrieve the saved payment method without another Stripe lookup
      await prisma.tabParticipant.update({
        where: { id: participant.id },
        data: { stripeCustomerId: customer.id },
      });

      setupClientSecret = setupIntent.client_secret;
    } catch (err) {
      // SetupIntent failure should not block the join — log and continue.
      // The UI will show the payment sheet with an error state.
      console.error('[join] SetupIntent creation failed:', err);
    }
  }

  // Set httpOnly anon cookie (24h, secure, SameSite=lax)
  const cookieStore = await cookies();
  cookieStore.set('tabs_anon', anonToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });

  return NextResponse.json({
    sessionId: session.id,
    participantId: participant.id,
    isHost,
    // setupClientSecret is null when restaurant has not yet connected Stripe.
    // Client shows the payment sheet when non-null; skips it when null.
    setupClientSecret,
    nextStep: setupClientSecret ? 'payment' : 'tab',
  });
}
