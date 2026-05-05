import { z } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Returns midnight (start of day) in the given IANA timezone as a UTC Date.
 * Used for "today's assignments" queries so they respect the restaurant's local
 * day boundary rather than UTC midnight (which is off by 4–8h for US timezones).
 */
export function startOfDayInTz(tz: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  // Construct as local midnight in that timezone, returned as UTC
  return new Date(
    new Date(`${year}-${month}-${day}T00:00:00`).toLocaleString('en-US', { timeZone: tz })
  );
}

export const uuidSchema = z.string().uuid();

/**
 * Validates that a route param is a valid UUID. Returns a 400 response if
 * invalid, or null if valid. Pattern:
 *
 *   const invalid = validateUuid(id, 'sessionId')
 *   if (invalid) return invalid
 */
export function validateUuid(value: string, paramName: string): NextResponse | null {
  if (!uuidSchema.safeParse(value).success) {
    return NextResponse.json({ error: `Invalid ${paramName}` }, { status: 400 });
  }
  return null;
}
