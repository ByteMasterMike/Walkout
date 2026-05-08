import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import OnboardingWizardClient from './OnboardingWizardClient';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect('/auth/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    redirect('/dashboard/tables');
  }

  const r = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: {
      stripeConnectOnboarded: true,
      taxRate: true,
      taxLabel: true,
      timezone: true,
      cloudPrintDeviceId: true,
      onboardingCompletedAt: true,
      _count: {
        select: {
          tables: true,
          menuItems: true,
        },
      },
    },
  });

  if (!r) redirect('/dashboard');

  return (
    <OnboardingWizardClient
      role={session.user.role}
      initial={{
        stripeConnectOnboarded: r.stripeConnectOnboarded,
        taxRate: r.taxRate.toString(),
        taxLabel: r.taxLabel,
        timezone: r.timezone,
        cloudPrintDeviceId: r.cloudPrintDeviceId,
        tableCount: r._count.tables,
        menuItemCount: r._count.menuItems,
        onboardingCompletedAt: r.onboardingCompletedAt?.toISOString() ?? null,
      }}
    />
  );
}
