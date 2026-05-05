import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['MANAGER', 'STAFF']),
});

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
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

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { email, name, role } = parsed.data;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { name: true },
  });
  if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });

  const existing = await prisma.restaurantStaff.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const inviteToken = uuidv4();
  const expiresIn72h = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await prisma.restaurantStaff.create({
    data: {
      restaurantId: session.user.restaurantId,
      email,
      name,
      role,
      inviteToken,
      inviteStatus: 'PENDING',
      isActive: false,
      invitedAt: new Date(),
    },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL ?? 'https://walkoutofficial.com'}/auth/staff/invite/${inviteToken}`;

  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: 'WalkOut <no-reply@walkoutofficial.com>',
      to: email,
      subject: `You've been invited to join ${restaurant.name} on WalkOut`,
      html: `
        <p>Hi ${name},</p>
        <p>${restaurant.name} has invited you to join their team on WalkOut as ${role === 'MANAGER' ? 'a Manager' : 'a Staff member'}.</p>
        <p><a href="${inviteUrl}" style="background:#000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Accept Invite</a></p>
        <p>This link expires in 72 hours.</p>
        <p style="color:#999;font-size:12px;">If you weren't expecting this, you can safely ignore it.</p>
      `,
    });
  }

  // Suppress token from response; it is single-use and delivered by email only
  return NextResponse.json({ ok: true, expiresAt: expiresIn72h.toISOString() }, { status: 201 });
}
