'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'DINER';

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard/tables',        label: 'Live Tables',       roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { href: '/dashboard/kitchen',       label: 'Kitchen Display',   roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { href: '/dashboard/requests',      label: 'Service Requests',  roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { href: '/dashboard/floor',         label: 'Floor Setup',       roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/menu',          label: 'Menu',              roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/settlements',   label: 'Settlements',       roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/analytics', label: 'Analytics', roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/analytics/tips', label: 'Tip Analytics',    roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/setup',         label: 'Table Setup',       roles: ['ADMIN'] },
  { href: '/dashboard/setup/staff',   label: 'Staff',             roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/setup/stripe',  label: 'Stripe Setup',      roles: ['ADMIN'] },
  { href: '/dashboard/setup/printer', label: 'Printer Setup',     roles: ['ADMIN'] },
];

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

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const navLinks = (
    <nav className="flex flex-col gap-0.5">
      {visible.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-gray-200 bg-white px-3 py-6">
        <Link href="/dashboard" className="px-3 mb-6 block">
          <span className="text-sm font-bold text-gray-900 truncate">{restaurantName}</span>
          <span className="block text-xs text-gray-400 mt-0.5 capitalize">{role.toLowerCase()}</span>
        </Link>
        {navLinks}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-white border-b border-gray-200 px-4 h-14">
        <Link href="/dashboard" className="text-sm font-bold text-gray-900 truncate max-w-[200px]">
          {restaurantName}
        </Link>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="Toggle menu"
        >
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-20 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 bg-white border-r border-gray-200 px-3 py-6 pt-16 flex flex-col">
            {navLinks}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
