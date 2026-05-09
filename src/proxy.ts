import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
const { auth } = NextAuth(authConfig);
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
      '/api/restaurant/analytics',
    ];
    if (managerPlusPaths.some((p) => pathname.startsWith(p))) {
      if (role !== 'MANAGER' && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    return NextResponse.next();
  }

  // ── Guest migration (anon cookie only; no diner session yet) ────────
  if (pathname === '/api/diner/migrate-from-guest') {
    const anonToken = request.cookies.get('tabs_anon')?.value;
    if (anonToken) {
      const headers = new Headers(request.headers);
      headers.set('x-anon-token', anonToken);
      return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
  }

  // ── Diner account UI + APIs (requires diner NextAuth session) ──────
  if (pathname.startsWith('/account') || pathname.startsWith('/api/diner')) {
    const session = await auth();
    if (!session?.user?.dinerId || session.user.role !== 'DINER') {
      const loginUrl = new URL('/auth/diner/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── Tip selector page (public; token + anon cookie guard API calls) ──
  if (pathname.startsWith('/tip/')) {
    return NextResponse.next();
  }

  return NextResponse.next();
}
