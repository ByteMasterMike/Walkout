import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MenuCategoryCreateSchema } from '@/lib/schemas/menu'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true, isVisible: true },
  })

  return NextResponse.json({ categories })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = MenuCategoryCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const category = await prisma.menuCategory.create({
    data: {
      restaurantId: session.user.restaurantId,
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder ?? 0,
      isVisible: parsed.data.isVisible ?? true,
    },
    select: { id: true, name: true, sortOrder: true, isVisible: true },
  })

  return NextResponse.json({ category }, { status: 201 })
}
