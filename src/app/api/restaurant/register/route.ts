import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  phone: z.string().optional(),
});

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t === '' ? undefined : t;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { name, password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const address = emptyToUndefined(parsed.data.address);
  const city = emptyToUndefined(parsed.data.city);
  const state = emptyToUndefined(parsed.data.state);
  const zipCode = emptyToUndefined(parsed.data.zipCode);
  const phone = emptyToUndefined(parsed.data.phone);

  try {
    const existing = await prisma.restaurant.findFirst({
      where: { email: { equals: parsed.data.email.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const restaurant = await prisma.restaurant.create({
      data: { name, email, passwordHash, address, city, state, zipCode, phone },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ restaurant }, { status: 201 });
  } catch (err) {
    console.error('[restaurant/register]', err);

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const targets = err.meta?.target;
        const fields = Array.isArray(targets) ? targets : targets != null ? [String(targets)] : [];
        if (fields.includes('email')) {
          return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
        }
      }
      if (err.code === 'P1001' || err.code === 'P1000') {
        return NextResponse.json(
          { error: 'Database is temporarily unavailable. Please try again.' },
          { status: 503 },
        );
      }
      if (err.code === 'P2022' || err.code === 'P2021') {
        return NextResponse.json(
          { error: 'Database is temporarily unavailable. Please try again.' },
          { status: 503 },
        );
      }
    }

    if (err instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json(
        { error: 'Database is temporarily unavailable. Please try again.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
