import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PrinterSetupClient from './PrinterSetupClient';
import { PageShell, PageHead } from '@/components/pitch';

export default async function PrinterSetupPage() {
  const session = await auth();
  if (!session?.user?.restaurantId || session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  let cloudPrintDeviceId: string | null = null;
  let cloudPrintEnabled = false;
  let cloudPrintAllowedIp: string | null = null;
  try {
    const r = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { cloudPrintDeviceId: true, cloudPrintEnabled: true, cloudPrintAllowedIp: true },
    });
    cloudPrintDeviceId = r?.cloudPrintDeviceId ?? null;
    cloudPrintEnabled = r?.cloudPrintEnabled ?? false;
    cloudPrintAllowedIp = r?.cloudPrintAllowedIp ?? null;
  } catch {
    // use defaults
  }

  return (
    <PageShell>
      <Link href="/dashboard/setup" className="mono mb-6 inline-block text-muted-foreground hover:text-foreground">
        ← Back to table setup
      </Link>
      <PageHead
        title={
          <>
            Receipt <em>printer</em> (CloudPRNT)
          </>
        }
        subtitle={
          <>
            Star Micronics mC-Print3 polls WalkOut for queued receipts. Cash payments print automatically
            and open the drawer via the receipt XML.
          </>
        }
      />

      <PrinterSetupClient
        initialDeviceId={cloudPrintDeviceId}
        initialEnabled={cloudPrintEnabled}
        initialAllowedIp={cloudPrintAllowedIp}
      />
    </PageShell>
  );
}
