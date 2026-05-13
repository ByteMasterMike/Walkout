import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect('/auth/login');

  const { role, restaurantId } = session.user;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 md:px-8">
      <header className="mb-10 border-b border-border pb-6">
        <h1 className="font-display text-4xl font-light tracking-[-0.035em] text-foreground md:text-5xl">
          Dashboard
        </h1>
        <p className="mt-3 max-w-xl font-body text-lg text-muted-foreground">
          Welcome back, {session.user.name} · <span className="text-foreground">{role}</span>
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

      <p className="mt-10 font-mono text-[11px] text-muted-foreground">
        Restaurant ID: <span className="text-amber-deep">{restaurantId}</span>
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
      className="group block rounded-[14px] border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-soft-line hover:shadow-md"
    >
      <p className="font-display text-[22px] font-light tracking-[-0.02em] text-card-foreground">{label}</p>
      <p className="mt-2 font-body text-[15px] leading-snug text-muted-foreground">{description}</p>
    </Link>
  );
}
