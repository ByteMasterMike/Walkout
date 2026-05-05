import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MenuItemCreateSchema } from '@/lib/schemas/menu'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const items = await prisma.menuItem.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      categoryId: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      isAvailable: true,
      allergens: true,
      isPopular: true,
      sortOrder: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      price: item.price.toString(),
    })),
  })
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

  const parsed = MenuItemCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const price = new Decimal(parsed.data.price)

  const item = await prisma.menuItem.create({
    data: {
      restaurantId: session.user.restaurantId,
      categoryId: parsed.data.categoryId ?? null,
      name: parsed.data.name,
      description: parsed.data.description,
      price,
      imageUrl: parsed.data.imageUrl,
      isAvailable: parsed.data.isAvailable ?? true,
      allergens: parsed.data.allergens ?? [],
      isPopular: parsed.data.isPopular ?? false,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
    select: {
      id: true,
      categoryId: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      isAvailable: true,
      allergens: true,
      isPopular: true,
      sortOrder: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ item: { ...item, price: item.price.toString() } }, { status: 201 })
}
