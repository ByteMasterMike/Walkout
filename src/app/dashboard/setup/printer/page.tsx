import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PrinterSetupClient from './PrinterSetupClient';

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
    <div className="max-w-xl mx-auto px-4 py-10">
      <Link href="/dashboard/setup" className="text-xs text-gray-400 hover:text-gray-600 mb-4 block">
        Back to table setup
      </Link>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Receipt printer (CloudPRNT)</h1>
      <p className="text-sm text-gray-500 mb-8">
        Star Micronics mC-Print3 polls WalkOut for queued receipts. Cash payments print automatically
        and open the drawer via the receipt XML.
      </p>

      <PrinterSetupClient
        initialDeviceId={cloudPrintDeviceId}
        initialEnabled={cloudPrintEnabled}
        initialAllowedIp={cloudPrintAllowedIp}
      />
    </div>
  );
}
