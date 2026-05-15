import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { validateUuid } from '@/lib/validate'
import { verifyTipToken } from '@/lib/tip/tipToken'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  const invalidSessionId = validateUuid(sessionId, 'sessionId')
  if (invalidSessionId) return invalidSessionId

  const anonToken = request.headers.get('x-anon-token')
  const nextAuthSession = await auth()
  const isAnon = Boolean(anonToken)
  const isStaff = Boolean(nextAuthSession?.user?.restaurantId)

  if (!isAnon && !isStaff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionRow = await prisma.tabSession.findUnique({
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
      restaurant: {
        select: {
          name: true,
          taxRate: true,
          taxEnabled: true,
          walkOutServiceFeePercent: true,
          walkOutServiceFeeFlat: true,
        },
      },
      table: {
        select: { tableNumber: true },
      },
    },
  })

  if (!sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const session = {
    id: sessionRow.id,
    tableId: sessionRow.tableId,
    restaurantId: sessionRow.restaurantId,
    status: sessionRow.status,
    assignedStaffId: sessionRow.assignedStaffId,
    lastHeartbeatAt: sessionRow.lastHeartbeatAt,
    createdAt: sessionRow.createdAt,
    updatedAt: sessionRow.updatedAt,
    restaurantName: sessionRow.restaurant.name,
    tableNumber: sessionRow.table.tableNumber,
    taxRate: sessionRow.restaurant.taxRate.toString(),
    taxEnabled: sessionRow.restaurant.taxEnabled,
    walkOutServiceFeePercent: sessionRow.restaurant.walkOutServiceFeePercent.toString(),
    walkOutServiceFeeFlat: sessionRow.restaurant.walkOutServiceFeeFlat,
  }

  // Verify staff belongs to the right restaurant
  if (isStaff && nextAuthSession?.user?.restaurantId !== session.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve anon participant if applicable (+ minted tip JWT for in-app checkout)
  let anonParticipantId: string | null = null
  let tipPrompt: {
    tipToken: string
    maxTipCents: number
    subtotalCents: number
  } | null = null

  if (isAnon && anonToken) {
    const anonParticipant = await prisma.tabParticipant.findFirst({
      where: { sessionId, anonToken },
      select: {
        id: true,
        tipPromptToken: true,
        captureStatus: true,
      },
    })
    if (!anonParticipant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
    anonParticipantId = anonParticipant.id

    if (
      anonParticipant.captureStatus === 'PENDING' &&
      anonParticipant.tipPromptToken &&
      process.env.TIP_SECRET
    ) {
      try {
        const claims = verifyTipToken(anonParticipant.tipPromptToken)
        tipPrompt = {
          tipToken: anonParticipant.tipPromptToken,
          maxTipCents: claims.maxTipCents,
          subtotalCents: claims.subtotalCents,
        }
      } catch {
        tipPrompt = null
      }
    }
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
        holdStatus: true,
        captureStatus: true,
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

  const participantsOut = participants.map((p) => {
    const base = {
      id: p.id,
      displayName: p.displayName,
      isHost: p.isHost,
      joinedAt: p.joinedAt,
      departedAt: p.departedAt,
    }
    const showPayment =
      !isAnon ||
      !anonParticipantId ||
      p.id === anonParticipantId
    return {
      ...base,
      ...(showPayment ? { holdStatus: p.holdStatus, captureStatus: p.captureStatus } : {}),
    }
  })

  return NextResponse.json({
    session,
    tipPrompt,
    participants: participantsOut,
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
