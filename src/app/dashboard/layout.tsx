import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import DashboardShell from '@/components/DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect('/auth/login');

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { name: true },
  });

  return (
    <DashboardShell
      role={session.user.role}
      restaurantName={restaurant?.name ?? 'WalkOut'}
    >
      {children}
    </DashboardShell>
  );
}
