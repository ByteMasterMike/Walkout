import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { HeartbeatSchema } from '@/lib/schemas/session'
import { validateUuid } from '@/lib/validate'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
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

  const parsed = HeartbeatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { participantId } = parsed.data

  // Verify the participantId actually belongs to this session
  if (anonToken) {
    const participant = await prisma.tabParticipant.findFirst({
      where: { id: participantId, sessionId, anonToken },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
  } else if (nextAuthSession?.user) {
    const participant = await prisma.tabParticipant.findFirst({
      where: {
        id: participantId,
        sessionId,
        diner: { email: nextAuthSession.user.email },
      },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
  }

  await prisma.tabSession.update({
    where: { id: sessionId },
    data: { lastHeartbeatAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
