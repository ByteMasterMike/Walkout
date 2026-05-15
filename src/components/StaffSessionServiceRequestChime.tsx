'use client';

import { useSession } from 'next-auth/react';

import GlobalServiceRequestChime from '@/components/GlobalServiceRequestChime';

/**
 * Subscribes staff users to the restaurant SSE channel app-wide so service-request chimes
 * fire on any page (not only under /dashboard).
 */
export default function StaffSessionServiceRequestChime() {
  const { data: session, status } = useSession();
  if (status !== 'authenticated' || !session?.user?.restaurantId) return null;

  const role = session.user.role;
  if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'STAFF') return null;

  return (
    <GlobalServiceRequestChime restaurantId={session.user.restaurantId} role={role} />
  );
}
