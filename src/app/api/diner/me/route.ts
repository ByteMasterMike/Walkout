import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDinerIdFromSession } from '@/lib/diner-session';

const PatchSchema = z.object({
  defaultTipBehavior: z
    .enum(['ASK', 'AUTO_18', 'AUTO_20', 'AUTO_22', 'AUTO_NONE'])
    .optional(),
  defaultIdleTimeoutMinutes: z.number().int().min(5).max(120).nullable().optional(),
  defaultDietaryNotes: z.string().max(100).nullable().optional(),
  autoChargeEnabled: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  const dinerId = getDinerIdFromSession(session);
  if (!dinerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const d = await prisma.diner.findUnique({
    where: { id: dinerId },
    select: {
      email: true,
      name: true,
      phone: true,
      stripeDefaultPaymentMethodId: true,
      autoChargeEnabled: true,
      defaultTipBehavior: true,
      defaultIdleTimeoutMinutes: true,
      defaultDietaryNotes: true,
    },
  });

  if (!d) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(d);
}

export async function PATCH(request: Request) {
  const session = await auth();
  const dinerId = getDinerIdFromSession(session);
  if (!dinerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.defaultTipBehavior !== undefined) update.defaultTipBehavior = data.defaultTipBehavior;
  if (data.defaultIdleTimeoutMinutes !== undefined) {
    update.defaultIdleTimeoutMinutes = data.defaultIdleTimeoutMinutes;
  }
  if (data.defaultDietaryNotes !== undefined) {
    update.defaultDietaryNotes = data.defaultDietaryNotes;
  }
  if (data.autoChargeEnabled !== undefined) update.autoChargeEnabled = data.autoChargeEnabled;

  const d = await prisma.diner.update({
    where: { id: dinerId },
    data: update as object,
    select: {
      email: true,
      name: true,
      phone: true,
      stripeDefaultPaymentMethodId: true,
      autoChargeEnabled: true,
      defaultTipBehavior: true,
      defaultIdleTimeoutMinutes: true,
      defaultDietaryNotes: true,
    },
  });

  return NextResponse.json(d);
}
