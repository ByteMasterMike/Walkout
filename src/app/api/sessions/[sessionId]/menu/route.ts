import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { validateUuid } from '@/lib/validate'

/**
 * GET /api/sessions/[sessionId]/menu
 *
 * Public menu for the diner tab — scoped to the session's restaurant.
 * Auth: anon cookie (x-anon-token) or staff session.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
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

  const tabSession = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: { restaurantId: true },
  })

  if (!tabSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (isStaff && nextAuthSession?.user?.restaurantId !== tabSession.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (isAnon && anonToken) {
    const participant = await prisma.tabParticipant.findFirst({
      where: { sessionId, anonToken },
      select: { id: true },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found in session' }, { status: 403 })
    }
  }

  const categories = await prisma.menuCategory.findMany({
    where: {
      restaurantId: tabSession.restaurantId,
      isVisible: true,
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      items: {
        where: { isAvailable: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          allergens: true,
          isPopular: true,
          isAvailable: true,
          categoryId: true,
        },
      },
    },
  })

  const out = categories
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      items: cat.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price.toString(),
        imageUrl: item.imageUrl,
        allergens: item.allergens,
        isPopular: item.isPopular,
        isAvailable: item.isAvailable,
        categoryId: item.categoryId ?? cat.id,
      })),
    }))
    .filter((c) => c.items.length > 0)

  return NextResponse.json({ categories: out })
}
