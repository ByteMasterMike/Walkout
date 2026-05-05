import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (
    !session?.user?.restaurantId ||
    (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const staff = await prisma.restaurantStaff.findMany({
    where: { restaurantId: session.user.restaurantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      inviteStatus: true,
      isActive: true,
      invitedAt: true,
      acceptedAt: true,
    },
    orderBy: { invitedAt: 'desc' },
  });

  return NextResponse.json({ staff, role: session.user.role });
}
