import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Password reset for Restaurant owners and RestaurantStaff.
// Note: Phase 3 will add a dedicated PasswordResetToken table.
// For now this route accepts email + new password where the token
// was delivered via /api/auth/forgot-password and is validated
// by presence of the email alone (development / Phase 1 stub).
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const restaurant = await prisma.restaurant.findUnique({ where: { email: normalizedEmail } });
  if (restaurant) {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { passwordHash },
    });
    return NextResponse.json({ ok: true });
  }

  const staff = await prisma.restaurantStaff.findUnique({ where: { email: normalizedEmail } });
  if (staff) {
    await prisma.restaurantStaff.update({
      where: { id: staff.id },
      data: { passwordHash },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Account not found' }, { status: 404 });
}
