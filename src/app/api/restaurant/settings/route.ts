import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ipv4OrCidrRegex =
  /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/;

const PatchSchema = z.object({
  tipDistributionMode: z.enum(['DIRECT', 'POOL']).optional(),
  absorbTipProcessingFee: z.boolean().optional(),
  tipPoolDisclaimerAccepted: z.boolean().optional(),
  cloudPrintDeviceId: z.union([z.string().min(1).max(128), z.null()]).optional(),
  cloudPrintEnabled: z.boolean().optional(),
  cloudPrintAllowedIp: z
    .union([
      z.literal(''),
      z.string().regex(ipv4OrCidrRegex),
      z.null(),
    ])
    .optional(),
});

/**
 * GET /api/restaurant/settings — ADMIN (restaurant preferences needed for setup / Phase 4).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.restaurantId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const row = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: {
      tipDistributionMode: true,
      absorbTipProcessingFee: true,
      tipPoolDisclaimerAt: true,
      cloudPrintDeviceId: true,
      cloudPrintEnabled: true,
      cloudPrintAllowedIp: true,
    },
  });

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}

/**
 * PATCH /api/restaurant/settings — ADMIN only.
 */
export async function PATCH(request: Request) {
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const update: Prisma.RestaurantUpdateInput = {};
  const data = parsed.data;

  if (data.tipDistributionMode !== undefined) {
    update.tipDistributionMode = data.tipDistributionMode;
  }
  if (data.absorbTipProcessingFee !== undefined) {
    update.absorbTipProcessingFee = data.absorbTipProcessingFee;
  }
  if (data.cloudPrintDeviceId !== undefined) {
    update.cloudPrintDeviceId = data.cloudPrintDeviceId;
  }
  if (data.cloudPrintEnabled !== undefined) {
    update.cloudPrintEnabled = data.cloudPrintEnabled;
  }
  if (data.cloudPrintAllowedIp !== undefined) {
    update.cloudPrintAllowedIp =
      data.cloudPrintAllowedIp === '' ? null : data.cloudPrintAllowedIp;
  }
  if (data.tipPoolDisclaimerAccepted === true) {
    update.tipPoolDisclaimerAt = new Date();
  }

  try {
    const restaurant = await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: update,
      select: {
        tipDistributionMode: true,
        absorbTipProcessingFee: true,
        tipPoolDisclaimerAt: true,
        cloudPrintDeviceId: true,
        cloudPrintEnabled: true,
        cloudPrintAllowedIp: true,
      },
    });

    return NextResponse.json(restaurant);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Device ID already in use' }, { status: 409 });
    }
    throw e;
  }
}
