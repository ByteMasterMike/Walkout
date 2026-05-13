import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import StripeConnectClient from './StripeConnectClient';
import { PageShell, PageHead } from '@/components/pitch';

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
    <PageShell>
      <PageHead
        title={
          <>
            Stripe <em>payments</em> setup
          </>
        }
        subtitle={
          <>
            Connect your Stripe account so WalkOut can authorize holds and capture payments on your
            behalf. This takes about 5 minutes and is required before any guest can open a tab.
          </>
        }
      />

      <StripeConnectClient
        isOnboarded={isOnboarded}
        hasAccount={hasAccount}
        returnedSuccess={returnedSuccess}
        returnedRefresh={returnedRefresh}
      />

      <div className="mt-10 border-t border-border pt-8">
        <h2 className="mono mb-4">How it works</h2>
        <div className="steps">
          <div className="s">
            <div className="n">01</div>
            <div className="t">
              Click <em>&quot;Connect Stripe&quot;</em> — you&apos;ll be taken to Stripe&apos;s hosted onboarding.
            </div>
          </div>
          <div className="s">
            <div className="n">02</div>
            <div className="t">Enter your business info, bank account, and verify your identity (~5 min).</div>
          </div>
          <div className="s">
            <div className="n">03</div>
            <div className="t">Stripe redirects you back here when complete.</div>
          </div>
          <div className="s">
            <div className="n">04</div>
            <div className="t">
              WalkOut will route all card charges to <em>your</em> Stripe account automatically.
            </div>
          </div>
        </div>
        <p className="mt-6 font-body text-[15px] leading-relaxed text-muted-foreground">
          WalkOut charges a 0.5% service fee per transaction, deducted at capture. All other funds
          go directly to your Stripe account. You are never billed separately.
        </p>
      </div>
    </PageShell>
  );
}
