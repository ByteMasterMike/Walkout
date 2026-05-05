import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const AcceptSchema = z.object({
  password: z.string().min(8),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const staff = await prisma.restaurantStaff.findUnique({
    where: { inviteToken: token },
    select: { id: true, email: true, inviteStatus: true, invitedAt: true },
  });

  if (!staff) {
    return NextResponse.json({ error: 'Invalid or already used invite link' }, { status: 401 });
  }

  if (staff.inviteStatus !== 'PENDING') {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 401 });
  }

  // Check 72h expiry
  const expires = new Date(staff.invitedAt.getTime() + 72 * 60 * 60 * 1000);
  if (new Date() > expires) {
    await prisma.restaurantStaff.update({
      where: { id: staff.id },
      data: { inviteStatus: 'EXPIRED' },
    });
    return NextResponse.json({ error: 'Invite link has expired' }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.restaurantStaff.update({
    where: { id: staff.id },
    data: {
      passwordHash,
      inviteStatus: 'ACCEPTED',
      acceptedAt: new Date(),
      isActive: true,
      inviteToken: null, // single-use: invalidate after acceptance
    },
  });

  return NextResponse.json({ email: staff.email });
}
