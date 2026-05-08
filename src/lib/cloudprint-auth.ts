import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Prefer `Authorization: Bearer <CLOUDPRINT_SECRET>`.
 * Legacy: `?token=` (may appear in access logs — migrate off).
 */
export function verifyCloudPrintSecret(
  request: Request,
  secret: string,
): { ok: boolean; usedLegacyQuery: boolean } {
  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (safeCompare(token, secret)) {
      return { ok: true, usedLegacyQuery: false };
    }
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('token') ?? '';
  if (q && safeCompare(q, secret)) {
    console.warn(
      '[cloudprint] Legacy ?token= query auth used; migrate to Authorization: Bearer (secrets in URLs may hit access logs).',
    );
    return { ok: true, usedLegacyQuery: true };
  }

  return { ok: false, usedLegacyQuery: false };
}
