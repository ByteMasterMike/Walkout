import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Public paths — always allow through ──────────────────────────
  if (
    pathname.startsWith('/join/') ||
    pathname.startsWith('/api/join/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  // ── Diner / guest session paths — forward anon cookie ────────────
  if (pathname.startsWith('/tab') || pathname.startsWith('/api/sessions')) {
    const anonToken = request.cookies.get('tabs_anon')?.value;
    if (anonToken) {
      const headers = new Headers(request.headers);
      headers.set('x-anon-token', anonToken);
      return NextResponse.next({ request: { headers } });
    }
    // Diner account session: handled downstream by route auth check
    return NextResponse.next();
  }

  // ── Restaurant / Staff dashboard paths ───────────────────────────
  // Owner self-service registration — must not require an existing session
  // (otherwise fetch POST follows 307 → POST /auth/login → 405).
  if (pathname === '/api/restaurant/register') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/restaurant')) {
    const session = await auth();

    if (!session?.user?.restaurantId) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const { role } = session.user;

    // ADMIN-only routes — invite and Stripe setup remain ADMIN-only
    const adminOnlyPaths = [
      '/dashboard/setup/stripe',
      '/dashboard/setup/printer',
      '/api/restaurant/stripe',
      '/api/restaurant/staff/invite',
      '/api/restaurant/settings',
      '/api/restaurant/print-jobs',
    ];
    if (adminOnlyPaths.some((p) => pathname.startsWith(p))) {
      if (role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    // MANAGER+ routes — Staff list/page promoted to MANAGER+ per PRD §21.2
    const managerPlusPaths = [
      '/dashboard/floor',
      '/dashboard/setup/staff',
      '/dashboard/analytics',
      '/dashboard/settlements',
      '/api/restaurant/staff',
      '/api/restaurant/floor',
      '/api/restaurant/tip-pool',
      '/api/restaurant/settlements',
    ];
    if (managerPlusPaths.some((p) => pathname.startsWith(p))) {
      if (role !== 'MANAGER' && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}
