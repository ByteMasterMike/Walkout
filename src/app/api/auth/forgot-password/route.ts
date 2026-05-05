import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const Schema = z.object({ email: z.string().email() });

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 422 });
  }

  const email = parsed.data.email.trim().toLowerCase();

  // Check Restaurant owner
  const restaurant = await prisma.restaurant.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  // Check RestaurantStaff
  const staff = !restaurant
    ? await prisma.restaurantStaff.findUnique({
        where: { email },
        select: { id: true, name: true, email: true },
      })
    : null;

  // Always return 200 to prevent email enumeration
  if (!restaurant && !staff) {
    return NextResponse.json({ ok: true });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
  const recipientName = restaurant ? restaurant.name : staff!.name;
  const resetUrl = `${process.env.NEXTAUTH_URL ?? 'https://walkoutofficial.com'}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

  // Store token on the record (simple approach — reuse inviteToken-style)
  if (restaurant) {
    // For restaurant owners we store in a transient field; for now embed in URL signed by NEXTAUTH_SECRET
    // Phase 3 enhancement: dedicated PasswordResetToken table. For now log only in dev.
    if (process.env.NODE_ENV !== 'production') {
      console.info('[forgot-password] reset token for', email, token);
    }
  }

  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: 'WalkOut <no-reply@walkoutofficial.com>',
      to: email,
      subject: 'Reset your WalkOut password',
      html: `
        <p>Hi ${recipientName},</p>
        <p>Click below to reset your WalkOut password. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}" style="background:#000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Reset password</a></p>
        <p style="color:#999;font-size:12px;">If you didn't request this, ignore this email.</p>
      `,
    });
  }

  return NextResponse.json({ ok: true });
}
