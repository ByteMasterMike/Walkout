import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDinerIdFromSession } from '@/lib/diner-session'

const PushSubscriptionSchema = z
  .object({
    endpoint: z.string().url().max(2048),
    expirationTime: z.number().int().nullable().optional(),
    keys: z.object({
      p256dh: z.string().max(256),
      auth: z.string().max(256),
    }),
  })
  .strict()

export async function POST(request: Request) {
  const session = await auth()
  const dinerId = getDinerIdFromSession(session)
  if (!dinerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PushSubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  await prisma.diner.update({
    where: { id: dinerId },
    data: { pushSubscription: parsed.data },
  })

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  const dinerId = getDinerIdFromSession(session);
  if (!dinerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await prisma.diner.update({
    where: { id: dinerId },
    data: { pushSubscription: Prisma.DbNull },
  });

  return NextResponse.json({ ok: true });
}
