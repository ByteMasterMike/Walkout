import { z } from 'zod';
import { NextResponse } from 'next/server';

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
