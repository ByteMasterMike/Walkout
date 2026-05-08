import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { validateUuid } from '@/lib/validate'
import { assignTipPromptTokensForSession } from '@/lib/tip/assignTipPromptTokens'

const CheckoutSchema = z.object({
  participantId: z.string().uuid(),
})

/**
 * POST /api/sessions/[sessionId]/checkout
 *
 * Diner-initiated departure:
 * - Last guest / full table: session OPEN → AWAITING_TIP (PRD §11.6).
 * - Host or guest leaves early while others remain: session stays OPEN; only this
 *   participant enters tip window; host may be reassigned (PRD §5.3.1).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params

  const invalidSessionId = validateUuid(sessionId, 'sessionId')
  if (invalidSessionId) return invalidSessionId

  const anonToken = request.headers.get('x-anon-token')
  const nextAuthSession = await auth()

  if (!anonToken && !nextAuthSession?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CheckoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { participantId } = parsed.data

  const invalidParticipantId = validateUuid(participantId, 'participantId')
  if (invalidParticipantId) return invalidParticipantId

  // Identity guard — mirror heartbeat route
  if (anonToken) {
    const participant = await prisma.tabParticipant.findFirst({
      where: { id: participantId, sessionId, anonToken },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (nextAuthSession?.user?.email) {
    const participant = await prisma.tabParticipant.findFirst({
      where: {
        id: participantId,
        sessionId,
        diner: { email: nextAuthSession.user.email },
      },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const session = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: { status: true, hostParticipantId: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status === 'AWAITING_TIP') {
    return NextResponse.json({ ok: true, alreadyDeparted: true })
  }

  if (session.status !== 'OPEN') {
    return NextResponse.json(
      { error: 'Checkout is only available for an open tab' },
      { status: 409 },
    )
  }

  const caller = await prisma.tabParticipant.findUnique({
    where: { id: participantId },
    select: { departedAt: true },
  })
  if (caller?.departedAt) {
    return NextResponse.json({ ok: true, alreadyDeparted: true })
  }

  const now = new Date()

  const remainingActiveCount = await prisma.tabParticipant.count({
    where: {
      sessionId,
      id: { not: participantId },
      departedAt: null,
      captureStatus: 'PENDING',
      holdStatus: { in: ['HELD', 'PENDING'] },
    },
  })

  // ── Early departure: others still at the table with an active hold ────────
  if (remainingActiveCount > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.tabParticipant.update({
        where: { id: participantId },
        data: { awaitingTipSince: now, departedAt: now },
      })

      if (session.hostParticipantId === participantId) {
        const nextHost = await tx.tabParticipant.findFirst({
          where: {
            sessionId,
            id: { not: participantId },
            departedAt: null,
            captureStatus: 'PENDING',
            holdStatus: { in: ['HELD', 'PENDING'] },
          },
          orderBy: { joinedAt: 'asc' },
        })

        if (nextHost) {
          await tx.tabSession.update({
            where: { id: sessionId },
            data: { hostParticipantId: nextHost.id },
          })
          console.info('[checkout] new host assigned', {
            sessionId,
            newHostParticipantId: nextHost.id,
          })
          // TODO(phase-5): push notification "You're now the host of Table X's tab."
        } else {
          await tx.tabSession.update({
            where: { id: sessionId },
            data: { status: 'CLOSING' },
          })
        }
      }
    })

    await assignTipPromptTokensForSession(sessionId, { participantIds: [participantId] })

    return NextResponse.json({ ok: true, sessionKept: true })
  }

  // ── Full table / last guest: existing behavior ───────────────────────────
  await prisma.$transaction([
    prisma.tabSession.update({
      where: { id: sessionId },
      data: {
        status: 'AWAITING_TIP',
        departureSource: 'DINER_SELF',
      },
    }),
    prisma.tabParticipant.updateMany({
      where: { sessionId, captureStatus: 'PENDING' },
      data: { awaitingTipSince: now, departedAt: now },
    }),
  ])

  await assignTipPromptTokensForSession(sessionId)

  return NextResponse.json({ ok: true })
}
