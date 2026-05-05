import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateUuid } from '@/lib/validate'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.restaurantId || !session.user.staffId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const invalidId = validateUuid(id, 'id')
  if (invalidId) return invalidId

  const serviceRequest = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, status: true },
  })

  if (!serviceRequest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (serviceRequest.restaurantId !== session.user.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (serviceRequest.status !== 'OPEN') {
    return NextResponse.json(
      { error: `Cannot acknowledge a request with status ${serviceRequest.status}` },
      { status: 409 }
    )
  }

  const updated = await prisma.serviceRequest.update({
    where: { id },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      acknowledgedById: session.user.staffId,
    },
    select: { id: true, status: true, acknowledgedAt: true, acknowledgedById: true },
  })

  return NextResponse.json({ serviceRequest: updated })
}
