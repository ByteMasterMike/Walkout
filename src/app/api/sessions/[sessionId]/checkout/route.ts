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
 * Diner-initiated departure: session OPEN → AWAITING_TIP, starts 15-min tip window (PRD §11.6).
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
    select: { status: true },
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

  const now = new Date()

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
