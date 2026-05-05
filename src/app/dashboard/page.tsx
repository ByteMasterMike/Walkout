import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect('/auth/login');

  const { role, restaurantId } = session.user;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {session.user.name} &middot;{' '}
          <span className="font-medium text-gray-700">{role}</span>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {role === 'ADMIN' && (
          <>
            <DashLink href="/dashboard/setup" label="Table Setup" description="Create tables and get NFC tag URLs" />
            <DashLink href="/dashboard/setup/staff" label="Staff Management" description="Invite and manage staff accounts" />
          </>
        )}
        {(role === 'ADMIN' || role === 'MANAGER') && (
          <DashLink href="/dashboard/floor" label="Floor Setup" description="Assign servers to tables" />
        )}
        <DashLink href="/dashboard/tables" label="Live Tables" description="View table status in real time" />
        <DashLink href="/dashboard/kitchen" label="Kitchen Display" description="KDS — order queue for the kitchen" />
        <DashLink href="/dashboard/requests" label="Service Requests" description="Diner requests from the floor" />
      </div>

      <p className="mt-8 text-xs text-gray-400">
        Restaurant ID: <span className="font-mono">{restaurantId}</span>
      </p>
    </div>
  );
}

function DashLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-gray-400 hover:shadow-sm transition-all"
    >
      <p className="font-semibold text-gray-900 text-sm">{label}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </Link>
  );
}
