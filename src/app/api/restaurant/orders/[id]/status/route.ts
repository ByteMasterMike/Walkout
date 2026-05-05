import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrderStatusUpdateSchema } from '@/lib/schemas/order'

// In-memory rate limiter for KDS PIN checks: staffId -> { count, windowStart }
// Resets after 15 minutes. For production, replace with a Redis-backed store.
const pinAttempts = new Map<string, { count: number; windowStart: number }>()

const PIN_MAX_ATTEMPTS = 5
const PIN_WINDOW_MS = 15 * 60 * 1000

function checkPinRateLimit(staffId: string): boolean {
  const now = Date.now()
  const entry = pinAttempts.get(staffId)

  if (!entry || now - entry.windowStart > PIN_WINDOW_MS) {
    pinAttempts.set(staffId, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= PIN_MAX_ATTEMPTS) {
    return false
  }

  pinAttempts.set(staffId, { count: entry.count + 1, windowStart: entry.windowStart })
  return true
}

function clearPinRateLimit(staffId: string) {
  pinAttempts.delete(staffId)
}

const STATUS_ORDER: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PREPPING: 2,
  SERVED: 3,
  CANCELLED: 99,
  CASH_PENDING: 4,
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = OrderStatusUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { status: newStatus, kdsDevicePin } = parsed.data

  const order = await prisma.orderItem.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      session: { select: { restaurantId: true } },
    },
  })

  if (!order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (order.session.restaurantId !== session.user.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const currentRank = STATUS_ORDER[order.status] ?? -1
  const newRank = STATUS_ORDER[newStatus] ?? -1

  if (newStatus !== 'CANCELLED' && newRank <= currentRank) {
    return NextResponse.json(
      { error: 'Status can only advance forward' },
      { status: 422 }
    )
  }

  // CANCELLED requires kdsDevicePin validation if the staff has one set
  if (newStatus === 'CANCELLED') {
    const staffId = session.user.staffId

    if (staffId) {
      const staffRecord = await prisma.restaurantStaff.findUnique({
        where: { id: staffId },
        select: { kdsDevicePin: true },
      })

      if (staffRecord?.kdsDevicePin) {
        if (!kdsDevicePin) {
          return NextResponse.json({ error: 'kdsDevicePin required' }, { status: 403 })
        }

        if (!checkPinRateLimit(staffId)) {
          return NextResponse.json(
            { error: 'Too many PIN attempts. Try again in 15 minutes.' },
            { status: 429 }
          )
        }

        const pinValid = await bcrypt.compare(kdsDevicePin, staffRecord.kdsDevicePin)
        if (!pinValid) {
          return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 })
        }

        clearPinRateLimit(staffId)
      }
    }
  }

  const updated = await prisma.orderItem.update({
    where: { id },
    data: { status: newStatus },
    select: { id: true, status: true, updatedAt: true },
  })

  return NextResponse.json({ order: updated })
}
