import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { verifyCardUpdateToken } from '@/lib/cardUpdateToken'

/**
 * GET /api/sessions/rejoin-setup?token=...
 *
 * Validates a card-update JWT and returns a SetupIntent client secret for the
 * participant's existing Stripe customer (connected account).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  let claims: ReturnType<typeof verifyCardUpdateToken>
  try {
    claims = verifyCardUpdateToken(token)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const participant = await prisma.tabParticipant.findFirst({
    where: { id: claims.participantId, sessionId: claims.sessionId },
    include: {
      session: {
        select: {
          restaurant: {
            select: {
              stripeConnectAccountId: true,
              stripeConnectOnboarded: true,
            },
          },
        },
      },
    },
  })

  if (!participant) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!participant.stripeCustomerId) {
    return NextResponse.json({ error: 'No saved customer for this tab' }, { status: 422 })
  }

  const restaurant = participant.session.restaurant
  if (!restaurant.stripeConnectAccountId || !restaurant.stripeConnectOnboarded) {
    return NextResponse.json({ error: 'Restaurant payments unavailable' }, { status: 422 })
  }

  let setupClientSecret: string | null = null
  try {
    const setupIntent = await stripe.setupIntents.create(
      {
        customer: participant.stripeCustomerId,
        usage: 'off_session',
        payment_method_types: ['card'],
        payment_method_options: {
          card: { request_three_d_secure: 'any' },
        },
        metadata: {
          participantId: participant.id,
          sessionId: claims.sessionId,
          type: 'card_update',
        },
      },
      { stripeAccount: restaurant.stripeConnectAccountId },
    )
    setupClientSecret = setupIntent.client_secret
  } catch (err) {
    console.error('[rejoin-setup] SetupIntent failed', err)
    return NextResponse.json({ error: 'Could not start card update' }, { status: 500 })
  }

  return NextResponse.json({
    setupClientSecret,
    sessionId: claims.sessionId,
    participantId: participant.id,
    stripeConnectAccountId: restaurant.stripeConnectAccountId,
    cardUpdateToken: token,
  })
}
