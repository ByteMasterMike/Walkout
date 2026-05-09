import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { enforceSignupMigrateLimit } from '@/lib/rate-limit';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  const limited = await enforceSignupMigrateLimit(request);
  if (limited) return limited;

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

  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    await prisma.diner.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        passwordHash,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Unable to complete registration' }, { status: 422 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
