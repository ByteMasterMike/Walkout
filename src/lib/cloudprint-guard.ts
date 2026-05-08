import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCloudPrintSecret } from '@/lib/cloudprint-auth';
import { getClientIp } from '@/lib/client-ip';
import { ipv4MatchesRule } from '@/lib/ip-allowlist';
import { enforceCloudprintLimit } from '@/lib/rate-limit';

/**
 * Shared CloudPRNT auth: Bearer (preferred), legacy ?token=, rate limit, device lookup, IP allowlist.
 */
export async function assertCloudprintAccess(
  request: Request,
  deviceId: string,
): Promise<
  | { ok: true; restaurantId: string }
  | { ok: false; response: NextResponse }
> {
  const secret = process.env.CLOUDPRINT_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'CloudPRNT not configured' }, { status: 503 }),
    };
  }

  const verified = verifyCloudPrintSecret(request, secret);
  if (!verified.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const ip = getClientIp(request) ?? '';
  const limited = await enforceCloudprintLimit(deviceId, ip);
  if (limited) {
    return { ok: false, response: limited };
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { cloudPrintDeviceId: deviceId },
    select: {
      id: true,
      cloudPrintEnabled: true,
      cloudPrintAllowedIp: true,
    },
  });

  if (!restaurant?.cloudPrintEnabled) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unknown device' }, { status: 404 }),
    };
  }

  const rule = restaurant.cloudPrintAllowedIp?.trim();
  if (rule) {
    if (!ip || !ipv4MatchesRule(ip, rule)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
  }

  return { ok: true, restaurantId: restaurant.id };
}
