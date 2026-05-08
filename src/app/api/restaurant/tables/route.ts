import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const CreateTableSchema = z.object({
  tableNumber: z.string().trim().min(1).max(20),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tables = await prisma.diningTable.findMany({
    where: { restaurantId: session.user.restaurantId, isActive: true },
    orderBy: { tableNumber: 'asc' },
    select: { id: true, tableNumber: true, nfcTagId: true, status: true, createdAt: true },
  });

  return NextResponse.json({ tables });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.restaurantId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const table = await prisma.diningTable.create({
    data: {
      restaurantId: session.user.restaurantId,
      tableNumber: parsed.data.tableNumber,
    },
    select: { id: true, tableNumber: true, nfcTagId: true, status: true, createdAt: true },
  });

  return NextResponse.json({ table }, { status: 201 });
}
