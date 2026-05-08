import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateUuid } from '@/lib/validate';

const BodySchema = z.object({
  participantId: z.string().uuid(),
});

function isParticipantSettled(p: {
  isCashPayment: boolean;
  cashCollectedAt: Date | null;
  captureStatus: string;
}): boolean {
  if (p.isCashPayment) {
    return p.cashCollectedAt != null;
  }
  return p.captureStatus === 'CAPTURED';
}

/**
 * POST /api/restaurant/sessions/[id]/cash-collected
 * Staff confirms physical cash received for a cash-paying guest.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const invalidId = validateUuid(sessionId, 'sessionId');
  if (invalidId) return invalidId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { participantId } = parsed.data;
  const invalidPid = validateUuid(participantId, 'participantId');
  if (invalidPid) return invalidPid;

  const tab = await prisma.tabSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      restaurantId: true,
      tableId: true,
      status: true,
    },
  });

  if (!tab) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (tab.restaurantId !== session.user.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const participant = await prisma.tabParticipant.findFirst({
    where: { id: participantId, sessionId },
    select: {
      id: true,
      isCashPayment: true,
      cashCollectedAt: true,
    },
  });

  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  if (!participant.isCashPayment) {
    return NextResponse.json({ error: 'Participant is not on cash payment' }, { status: 422 });
  }

  if (participant.cashCollectedAt) {
    return NextResponse.json({ error: 'Cash already marked collected' }, { status: 409 });
  }

  const staffId = session.user.staffId ?? null;
  const now = new Date();

  await prisma.tabParticipant.update({
    where: { id: participantId },
    data: {
      cashCollectedAt: now,
      cashCollectedByStaffId: staffId,
    },
  });

  const participants = await prisma.tabParticipant.findMany({
    where: { sessionId },
    select: {
      isCashPayment: true,
      cashCollectedAt: true,
      captureStatus: true,
    },
  });

  const allSettled = participants.every(isParticipantSettled);

  if (allSettled) {
    await prisma.$transaction([
      prisma.tabSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: now,
          updatedAt: now,
        },
      }),
      prisma.diningTable.update({
        where: { id: tab.tableId },
        data: { status: 'AVAILABLE' },
      }),
    ]);
  } else {
    await prisma.tabSession.update({
      where: { id: sessionId },
      data: { updatedAt: now },
    });
  }

  return NextResponse.json({
    ok: true,
    sessionClosed: allSettled,
  });
}
