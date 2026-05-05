import { NextResponse } from 'next/server'
import { Decimal } from 'decimal.js'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MenuItemUpdateSchema } from '@/lib/schemas/menu'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const existing = await prisma.menuItem.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = MenuItemUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { price: priceStr, ...rest } = parsed.data
  const price = priceStr !== undefined ? new Decimal(priceStr) : undefined

  // Verify categoryId belongs to this restaurant (cross-tenant FK guard)
  if (parsed.data.categoryId !== undefined && parsed.data.categoryId !== null) {
    const category = await prisma.menuCategory.findFirst({
      where: { id: parsed.data.categoryId, restaurantId: session.user.restaurantId },
      select: { id: true },
    })
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
  }

  const item = await prisma.menuItem.update({
    where: { id },
    data: { ...rest, ...(price !== undefined ? { price } : {}) },
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
      updatedAt: true,
    },
  })

  return NextResponse.json({ item: { ...item, price: item.price.toString() } })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const existing = await prisma.menuItem.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.menuItem.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
