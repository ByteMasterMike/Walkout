import { NextResponse } from 'next/server';

// Redirect legacy /api/register to /api/restaurant/register
export async function POST(request: Request) {
  const url = new URL('/api/restaurant/register', request.url);
  return NextResponse.redirect(url, 308);
}
