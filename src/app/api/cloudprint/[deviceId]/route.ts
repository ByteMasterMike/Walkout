import { NextResponse } from 'next/server';
import { assertCloudprintAccess } from '@/lib/cloudprint-guard';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/cloudprint/[deviceId]
 * Star Micronics CloudPRNT polling endpoint (PRD §16.1).
 * Auth: `Authorization: Bearer <CLOUDPRINT_SECRET>` (preferred); legacy `?token=` supported with warning logs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;

  const access = await assertCloudprintAccess(request, deviceId);
  if (!access.ok) return access.response;

  const job = await prisma.printJob.findFirst({
    where: {
      restaurantId: access.restaurantId,
      status: 'QUEUED',
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!job) {
    return new Response(null, { status: 204 });
  }

  await prisma.printJob.update({
    where: { id: job.id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  });

  const body = Buffer.isBuffer(job.content)
    ? job.content
    : Buffer.from(job.content);

  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.star.starprnt',
      'Cache-Control': 'no-store',
    },
  });
}
