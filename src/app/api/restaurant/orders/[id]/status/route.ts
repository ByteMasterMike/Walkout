import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrderStatusUpdateSchema } from '@/lib/schemas/order'
import { validateUuid } from '@/lib/validate'

const PIN_MAX_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;

// DB-backed PIN rate limiter using pinAttemptCount + pinLockedUntil on RestaurantStaff.
// Serverless-safe — no in-memory state, persists across Lambda cold starts.
async function checkAndIncrementPinAttempts(staffId: string): Promise<boolean> {
  const now = new Date();
  const staff = await prisma.restaurantStaff.findUnique({
    where: { id: staffId },
    select: { pinAttemptCount: true, pinLockedUntil: true },
  });
  if (!staff) return false;

  // Still locked
  if (staff.pinLockedUntil && staff.pinLockedUntil > now) return false;

  // Window expired or never set — reset counter
  const reset = !staff.pinLockedUntil || staff.pinLockedUntil <= now;
  const newCount = reset ? 1 : staff.pinAttemptCount + 1;
  const lockedUntil = newCount >= PIN_MAX_ATTEMPTS
    ? new Date(now.getTime() + PIN_WINDOW_MS)
    : null;

  await prisma.restaurantStaff.update({
    where: { id: staffId },
    data: { pinAttemptCount: newCount, pinLockedUntil: lockedUntil },
  });
  return newCount <= PIN_MAX_ATTEMPTS;
}

async function clearPinAttempts(staffId: string): Promise<void> {
  await prisma.restaurantStaff.update({
    where: { id: staffId },
    data: { pinAttemptCount: 0, pinLockedUntil: null },
  });
}

// Forward-progress rank table. Only transitions to a higher rank are allowed,
// except CANCELLED (rank 99) which is always reachable from any state.
//
// CASH_PENDING (rank 4) sits above SERVED (rank 3):
//   - CASH_PENDING → CANCELLED is intentionally allowed (staff voids a cash order).
//   - CASH_PENDING → SERVED is blocked (a cash order cannot be marked served via KDS;
//     it closes when staff taps "Cash Collected" on the floor dashboard instead).
const STATUS_ORDER: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PREPPING: 2,
  SERVED: 3,
  CASH_PENDING: 4,
  CANCELLED: 99,
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

  const invalidId = validateUuid(id, 'id')
  if (invalidId) return invalidId

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

        const allowed = await checkAndIncrementPinAttempts(staffId);
        if (!allowed) {
          return NextResponse.json(
            { error: 'Too many PIN attempts. Try again in 15 minutes.' },
            { status: 429 }
          );
        }

        const pinValid = await bcrypt.compare(kdsDevicePin, staffRecord.kdsDevicePin);
        if (!pinValid) {
          return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 });
        }

        await clearPinAttempts(staffId);
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
