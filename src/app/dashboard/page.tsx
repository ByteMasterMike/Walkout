import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import {
  PageShell,
  PageHead,
  PageHeadMetaDot,
  KpiStrip,
  DashboardTile,
  DashIdBar,
} from '@/components/pitch';
import {
  TileCalIcon,
  TileUsersIcon,
  TileGridIcon,
  TileChefIcon,
  TileBellIcon,
} from '@/components/icons/prototype';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.restaurantId) redirect('/auth/login');

  const { role, restaurantId } = session.user;
  const nameFirst = session.user.name?.split(/\s+/)[0] ?? 'there';

  const now = new Date();
  const dayLine = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeLine = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const kpiItems = [
    {
      label: 'Tables active',
      value: (
        <>
          <em>—</em>
          <span className="c"> / —</span>
        </>
      ),
      detail: 'TODO: wire aggregates API',
    },
    {
      label: 'Revenue tonight',
      value: '—',
      detail: 'TODO',
    },
    {
      label: 'Avg ticket',
      value: '—',
      detail: 'TODO',
      detailClass: 'wn',
    },
    {
      label: 'Open holds',
      value: '—',
      detail: 'TODO',
    },
  ];

  const tiles: {
    href: string;
    corner: string;
    icon: ReactNode;
    title: string;
    titleEm: string;
    description: string;
    roles: Array<'ADMIN' | 'MANAGER' | 'STAFF'>;
  }[] = [
    {
      href: '/dashboard/setup',
      corner: 'N° 01',
      icon: <TileCalIcon />,
      title: 'Table',
      titleEm: 'setup',
      description: 'Create tables and get NFC tag URLs.',
      roles: ['ADMIN'],
    },
    {
      href: '/dashboard/setup/staff',
      corner: 'N° 02',
      icon: <TileUsersIcon />,
      title: 'Staff',
      titleEm: 'management',
      description: 'Invite team members and assign roles.',
      roles: ['ADMIN'],
    },
    {
      href: '/dashboard/floor',
      corner: 'N° 03',
      icon: <TileGridIcon />,
      title: 'Floor',
      titleEm: 'setup',
      description: 'Assign servers to tables before service.',
      roles: ['ADMIN', 'MANAGER'],
    },
    {
      href: '/dashboard/tables',
      corner: 'N° 04',
      icon: <TileCalIcon />,
      title: 'Live',
      titleEm: 'tables',
      description: 'Every tab in the room, in real time.',
      roles: ['ADMIN', 'MANAGER', 'STAFF'],
    },
    {
      href: '/dashboard/kitchen',
      corner: 'N° 05',
      icon: <TileChefIcon />,
      title: 'Kitchen',
      titleEm: 'display',
      description: 'KDS — order queue for the kitchen.',
      roles: ['ADMIN', 'MANAGER', 'STAFF'],
    },
    {
      href: '/dashboard/requests',
      corner: 'N° 06',
      icon: <TileBellIcon />,
      title: 'Service',
      titleEm: 'requests',
      description: 'Diner requests from the floor.',
      roles: ['ADMIN', 'MANAGER', 'STAFF'],
    },
  ];

  const dashboardRole =
    role === 'ADMIN' || role === 'MANAGER' || role === 'STAFF' ? role : null;
  const visibleTiles = dashboardRole
    ? tiles.filter((t) => t.roles.includes(dashboardRole))
    : [];

  return (
    <PageShell>
      <PageHead
        title={
          <>
            Welcome back, <em>{nameFirst}.</em>
          </>
        }
        subtitle={
          <>
            {dayLine} · signed in as {role}. Operational KPIs below are placeholders until an
            aggregates API exists.
          </>
        }
        meta={
          <>
            <PageHeadMetaDot />
            Live · {timeLine}
          </>
        }
      />

      <KpiStrip items={kpiItems} />

      <div className="tiles mt-40">
        {visibleTiles.map((t) => (
          <DashboardTile
            key={t.href}
            href={t.href}
            corner={t.corner}
            icon={t.icon}
            title={t.title}
            titleEm={t.titleEm}
            description={t.description}
          />
        ))}
      </div>

      <DashIdBar id={restaurantId} />
    </PageShell>
  );
}
