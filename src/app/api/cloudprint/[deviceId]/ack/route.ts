import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertCloudprintAccess } from '@/lib/cloudprint-guard';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const AckSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['PRINTED', 'FAILED']),
});

/**
 * POST /api/cloudprint/[deviceId]/ack
 * Printer completion callback (PRD §16.2).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;

  const access = await assertCloudprintAccess(request, deviceId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { jobId, status } = parsed.data;

  const job = await prisma.printJob.findFirst({
    where: {
      id: jobId,
      restaurantId: access.restaurantId,
    },
    select: { id: true },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const now = new Date();
  await prisma.printJob.update({
    where: { id: jobId },
    data:
      status === 'PRINTED'
        ? {
            status: 'PRINTED',
            printedAt: now,
            failedAt: null,
          }
        : {
            status: 'FAILED',
            failedAt: now,
          },
  });

  return NextResponse.json({ ok: true });
}
