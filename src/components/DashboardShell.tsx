'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'DINER';

type NavItem = {
  href: string;
  label: string;
  roles: Role[];
};

const NAV_SECTIONS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/tables', label: 'Live Tables', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
      { href: '/dashboard/kitchen', label: 'Kitchen Display', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
      { href: '/dashboard/requests', label: 'Service Requests', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
      { href: '/dashboard/floor', label: 'Floor Setup', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    label: 'Catalog & reports',
    items: [
      { href: '/dashboard/menu', label: 'Menu', roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/settlements', label: 'Settlements', roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/analytics', label: 'Analytics', roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/analytics/tips', label: 'Tip Analytics', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/dashboard/setup', label: 'Table Setup', roles: ['ADMIN'] },
      { href: '/dashboard/setup/staff', label: 'Staff', roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/setup/stripe', label: 'Stripe Setup', roles: ['ADMIN'] },
      { href: '/dashboard/setup/printer', label: 'Printer Setup', roles: ['ADMIN'] },
    ],
  },
];

function formatRole(role: Role): string {
  const r = role.toLowerCase();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export default function DashboardShell({
  role,
  restaurantName,
  children,
}: {
  role: Role;
  restaurantName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = NAV_SECTIONS.map((section, si) => {
    const visibleItems = section.items.filter((item) => item.roles.includes(role));
    if (visibleItems.length === 0) return null;

    return (
      <div key={si} className={si > 0 ? 'mt-4' : ''}>
        {section.label && (
          <div className="px-3.5 mb-1.5 mt-5 first:mt-0 font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            {section.label}
          </div>
        )}
        <nav className="flex flex-col gap-0.5">
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3.5 py-[11px] text-left font-body text-[17px] transition-colors ${
                  active
                    ? 'border-border bg-accent text-foreground shadow-sm'
                    : 'border-transparent text-muted-foreground hover:bg-scrim-2 hover:text-foreground'
                }`}
              >
                <span>{item.label}</span>
                {active ? (
                  <span className="shrink-0 font-display text-[22px] leading-none text-primary">›</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  });

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-background px-6 pb-8 pt-8 md:flex">
        <Link href="/dashboard" className="block border-b border-border pb-6 mb-6">
          <h2 className="font-display text-[32px] font-light leading-none tracking-[-0.025em] text-foreground">
            <span className="italic text-primary">{restaurantName}</span>
          </h2>
          <p className="mt-2 font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            {formatRole(role)} · Dashboard
          </p>
        </Link>
        {navContent}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-16 z-30 flex h-14 items-center justify-between border-b border-border bg-topbar px-4 backdrop-blur-[14px] md:hidden">
        <Link href="/dashboard" className="max-w-[200px] truncate font-display text-lg font-light italic text-foreground">
          {restaurantName}
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg text-muted-foreground transition-colors hover:bg-scrim-2 hover:text-foreground"
          aria-label="Toggle menu"
        >
          <span className="block h-0.5 w-5 bg-current mb-1" />
          <span className="block h-0.5 w-5 bg-current mb-1" />
          <span className="block h-0.5 w-5 bg-current" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-20 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-64 flex-col overflow-y-auto border-r border-border bg-background px-5 pb-8 pt-20">
            {navContent}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="dashboard-main-wash min-h-[calc(100vh-4rem)] flex-1 min-w-0 bg-background pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
