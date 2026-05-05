import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  const anonToken = request.headers.get('x-anon-token')
  const nextAuthSession = await auth()
  const isAnon = Boolean(anonToken)
  const isStaff = Boolean(nextAuthSession?.user?.restaurantId)

  if (!isAnon && !isStaff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const session = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tableId: true,
      restaurantId: true,
      status: true,
      assignedStaffId: true,
      lastHeartbeatAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Verify staff belongs to the right restaurant
  if (isStaff && nextAuthSession?.user?.restaurantId !== session.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve anon participant if applicable
  let anonParticipantId: string | null = null
  if (isAnon && anonToken) {
    const participant = await prisma.tabParticipant.findFirst({
      where: { sessionId, anonToken },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
    anonParticipantId = participant.id
  }

  // For anon callers: only return their own orders and service requests
  const orderFilter = isAnon && anonParticipantId
    ? { sessionId, participantId: anonParticipantId }
    : { sessionId }
  const serviceRequestFilter = isAnon && anonParticipantId
    ? { sessionId, participantId: anonParticipantId }
    : { sessionId }

  // Run all three reads in parallel — they are independent queries
  const [participants, orders, serviceRequests] = await Promise.all([
    prisma.tabParticipant.findMany({
      where: { sessionId },
      select: {
        id: true,
        displayName: true,
        isHost: true,
        joinedAt: true,
        departedAt: true,
      },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.orderItem.findMany({
      where: orderFilter,
      select: {
        id: true,
        participantId: true,
        menuItemId: true,
        menuItem: { select: { name: true } },
        quantity: true,
        unitPrice: true,
        taxRate: true,
        taxAmount: true,
        notes: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.serviceRequest.findMany({
      where: serviceRequestFilter,
      select: {
        id: true,
        participantId: true,
        type: true,
        status: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return NextResponse.json({
    session,
    participants,
    orders: orders.map((o) => ({
      id: o.id,
      participantId: o.participantId,
      menuItemId: o.menuItemId,
      menuItemName: o.menuItem.name,
      quantity: o.quantity,
      unitPrice: o.unitPrice.toString(),
      taxRate: o.taxRate.toString(),
      taxAmount: o.taxAmount.toString(),
      notes: o.notes,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    serviceRequests: serviceRequests.map((sr) => ({
      id: sr.id,
      participantId: sr.participantId,
      type: sr.type,
      status: sr.status,
      notes: sr.notes,
      createdAt: sr.createdAt.toISOString(),
    })),
  })
}
