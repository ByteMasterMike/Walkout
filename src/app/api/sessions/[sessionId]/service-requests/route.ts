import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ServiceRequestType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { validateUuid } from '@/lib/validate'

const ServiceRequestCreateSchema = z.object({
  type: z.nativeEnum(ServiceRequestType),
})

/**
 * POST /api/sessions/[sessionId]/service-requests
 *
 * Diner creates a service request. Session must be OPEN.
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

  const parsed = ServiceRequestCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { type } = parsed.data

  let participantId: string | null = null

  if (anonToken) {
    const participant = await prisma.tabParticipant.findFirst({
      where: { sessionId, anonToken },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
    participantId = participant.id
  } else if (nextAuthSession?.user?.email) {
    const participant = await prisma.tabParticipant.findFirst({
      where: {
        sessionId,
        diner: { email: nextAuthSession.user.email },
      },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
    participantId = participant.id
  }

  if (!participantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const session = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: { status: true, restaurantId: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status !== 'OPEN') {
    return NextResponse.json({ error: 'Session is not open for requests' }, { status: 409 })
  }

  const created = await prisma.serviceRequest.create({
    data: {
      sessionId,
      participantId,
      restaurantId: session.restaurantId,
      type,
    },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
    },
  })

  return NextResponse.json(
    {
      serviceRequest: {
        id: created.id,
        type: created.type,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  )
}
