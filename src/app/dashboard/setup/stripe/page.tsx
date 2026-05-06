import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import StripeConnectClient from './StripeConnectClient';

export default async function StripeSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; refresh?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.restaurantId || session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const params = await searchParams;

  let restaurant: { stripeConnectAccountId: string | null; stripeConnectOnboarded: boolean } | null = null;
  try {
    restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { stripeConnectAccountId: true, stripeConnectOnboarded: true },
    });
  } catch {
    // Fall through — treat as not onboarded
  }

  const isOnboarded = restaurant?.stripeConnectOnboarded ?? false;
  const hasAccount = !!restaurant?.stripeConnectAccountId;
  const returnedSuccess = params.success === '1';
  const returnedRefresh = params.refresh === '1';

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Stripe Payments Setup</h1>
      <p className="text-sm text-gray-500 mb-8">
        Connect your Stripe account so WalkOut can authorize holds and capture payments on your
        behalf. This takes about 5 minutes and is required before any guest can open a tab.
      </p>

      <StripeConnectClient
        isOnboarded={isOnboarded}
        hasAccount={hasAccount}
        returnedSuccess={returnedSuccess}
        returnedRefresh={returnedRefresh}
      />

      <div className="mt-8 border-t border-gray-100 pt-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          How it works
        </h2>
        <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
          <li>Click &ldquo;Connect Stripe&rdquo; — you&apos;ll be taken to Stripe&apos;s hosted onboarding.</li>
          <li>Enter your business info, bank account, and verify your identity (~5 min).</li>
          <li>Stripe redirects you back here when complete.</li>
          <li>WalkOut will route all card charges to your Stripe account automatically.</li>
        </ol>
        <p className="mt-4 text-xs text-gray-400">
          WalkOut charges a 0.5% service fee per transaction, deducted at capture. All other funds
          go directly to your Stripe account. You are never billed separately.
        </p>
      </div>
    </div>
  );
}
