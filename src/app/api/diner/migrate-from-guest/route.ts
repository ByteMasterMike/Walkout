import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { enforceSignupMigrateLimit } from '@/lib/rate-limit';

const Schema = z.object({
  participantId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(120),
});

/**
 * POST /api/diner/migrate-from-guest
 *
 * Guest → account (PRD §11.8). Requires matching `x-anon-token` for the participant.
 */
export async function POST(request: Request) {
  const limited = await enforceSignupMigrateLimit(request);
  if (limited) return limited;

  const anonToken = request.headers.get('x-anon-token');
  if (!anonToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const { participantId, email, password, name } = parsed.data;
  const emailNorm = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const participant = await tx.tabParticipant.findUnique({
        where: { id: participantId },
        include: { session: true },
      });

      if (!participant || participant.anonToken !== anonToken) {
        throw new Error('UNAUTHORIZED');
      }

      if (!participant.stripeCustomerId) {
        throw new Error('NO_CUSTOMER');
      }

      const diner = await tx.diner.create({
        data: {
          email: emailNorm,
          name: name.trim(),
          passwordHash,
          stripeCustomerId: participant.stripeCustomerId,
          stripeDefaultPaymentMethodId: participant.stripePaymentMethodId,
          autoChargeEnabled: true,
          defaultTipBehavior: 'ASK',
        },
      });

      await tx.tabParticipant.update({
        where: { id: participantId },
        data: { dinerId: diner.id, anonToken: null },
      });

      const anon = await tx.anonSession.findFirst({ where: { token: anonToken } });
      if (anon) {
        await tx.anonSession.update({
          where: { id: anon.id },
          data: { mergedInto: diner.id },
        });
      }
    });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Unable to complete migration' }, { status: 422 });
    }
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (msg === 'NO_CUSTOMER') {
      return NextResponse.json({ error: 'No saved card on this tab' }, { status: 422 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
