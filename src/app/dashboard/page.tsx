import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeRestaurantAnalyticsToday } from '@/lib/analytics/today';

import DashboardOverviewClient from './DashboardOverviewClient';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect('/auth/login');

  if (session.user.role === 'STAFF') {
    redirect('/dashboard/floor');
  }

  const restaurantId = session.user.restaurantId;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      timezone: true,
      onboardingCompletedAt: true,
    },
  });

  const analytics = await computeRestaurantAnalyticsToday(restaurantId, restaurant?.timezone);

  const showOnboardingBanner =
    (session.user.role === 'ADMIN' || session.user.role === 'MANAGER') &&
    !restaurant?.onboardingCompletedAt;

  return (
    <DashboardOverviewClient
      role={session.user.role as 'ADMIN' | 'MANAGER'}
      userName={session.user.name ?? ''}
      restaurantId={restaurantId}
      initialAnalytics={analytics}
      showOnboardingBanner={showOnboardingBanner}
    />
  );
}
