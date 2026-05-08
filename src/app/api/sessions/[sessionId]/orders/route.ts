import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { OrderCreateSchema } from '@/lib/schemas/order'
import { validateUuid } from '@/lib/validate'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  const invalidSessionId = validateUuid(sessionId, 'sessionId')
  if (invalidSessionId) return invalidSessionId

  // Identify caller: anon token from middleware header, or authenticated diner/staff
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

  const parsed = OrderCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { menuItemId, quantity, notes } = parsed.data

  // Resolve participant identity
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
  } else if (nextAuthSession?.user) {
    // Diner authenticated via NextAuth: look up by dinerId
    const dinerParticipant = await prisma.tabParticipant.findFirst({
      where: {
        sessionId,
        diner: { email: nextAuthSession.user.email },
      },
      select: { id: true },
    })
    if (!dinerParticipant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
    participantId = dinerParticipant.id
  }

  if (!participantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch menu item and restaurant tax rate together
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: {
      price: true,
      isAvailable: true,
      restaurantId: true,
      restaurant: { select: { taxRate: true, taxEnabled: true } },
    },
  })

  if (!menuItem || !menuItem.isAvailable) {
    return NextResponse.json({ error: 'Menu item not found or unavailable' }, { status: 404 })
  }

  // Verify the menu item belongs to the session's restaurant
  const session = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: { restaurantId: true, status: true },
  })

  if (!session || session.status !== 'OPEN') {
    return NextResponse.json({ error: 'Session not open' }, { status: 409 })
  }

  if (menuItem.restaurantId !== session.restaurantId) {
    return NextResponse.json({ error: 'Menu item does not belong to this restaurant' }, { status: 422 })
  }

  // Snapshot price and tax at order time — architectural rule §4
  const unitPrice = new Decimal(menuItem.price.toString())
  const taxRate = menuItem.restaurant.taxEnabled
    ? new Decimal(menuItem.restaurant.taxRate.toString())
    : new Decimal(0)

  // taxAmount = unitPrice * taxRate * quantity
  const taxAmount = unitPrice.times(taxRate).times(quantity)

  const orderItem = await prisma.orderItem.create({
    data: {
      sessionId,
      participantId,
      menuItemId,
      unitPrice,
      taxRate,
      taxAmount,
      quantity,
      notes: notes ?? null,
    },
    select: {
      id: true,
      sessionId: true,
      participantId: true,
      menuItemId: true,
      unitPrice: true,
      taxRate: true,
      taxAmount: true,
      quantity: true,
      notes: true,
      status: true,
      createdAt: true,
    },
  })

  await prisma.tabSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  })

  return NextResponse.json(
    {
      order: {
        ...orderItem,
        unitPrice: orderItem.unitPrice.toString(),
        taxRate: orderItem.taxRate.toString(),
        taxAmount: orderItem.taxAmount.toString(),
      },
    },
    { status: 201 }
  )
}
