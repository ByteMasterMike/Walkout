import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  const { restaurantId } = await params
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim()

  const searchFilter = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [categories, items] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId, isVisible: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, sortOrder: true },
    }),
    prisma.menuItem.findMany({
      where: {
        restaurantId,
        isAvailable: true,
        ...searchFilter,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        categoryId: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        allergens: true,
        isPopular: true,
      },
    }),
  ])

  return NextResponse.json({
    categories,
    items: items.map((item) => ({ ...item, price: item.price.toString() })),
  })
}
