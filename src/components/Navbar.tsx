'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LayoutDashboard, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

function ChevronLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" fill="none">
      <defs>
        <linearGradient id="chev-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0b36a" />
          <stop offset="100%" stopColor="#b96e1e" />
        </linearGradient>
      </defs>
      <path d="M4 5 L17 16 L4 27 L9 27 L22 16 L9 5 Z" fill="url(#chev-grad)" />
      <path d="M18 5 L31 16 L18 27 L23 27 L36 16 L23 5 Z" fill="url(#chev-grad)" opacity="0.45" />
    </svg>
  );
}

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

export default function Navbar() {
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-topbar backdrop-blur-[14px] transition-colors duration-300">
      <div className="mx-auto flex h-[65px] w-full max-w-[1600px] items-center justify-between gap-4 px-8">
        <Link href="/" className="group flex items-center gap-2.5 no-underline hover:no-underline">
          <ChevronLogo className="h-5 w-[30px] shrink-0" />
          <span className="font-display text-[22px] font-normal italic leading-none tracking-tight text-foreground">
            walkout
          </span>
        </Link>

        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={toggle}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border text-foreground transition-colors duration-200 hover:border-amber-soft-line hover:text-primary"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {session ? (
            <>
              {navLinks.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link key={href} href={href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`hidden gap-2 rounded-full font-mono text-[10px] font-medium uppercase tracking-[0.18em] sm:inline-flex ${
                        isActive
                          ? 'bg-invert text-invert-foreground hover:bg-invert hover:text-invert-foreground'
                          : 'text-muted-foreground hover:bg-scrim-3 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </Button>
                  </Link>
                );
              })}

              <div className="ml-1 flex items-center gap-3.5">
                <div className="hidden items-center gap-2 sm:flex">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-gradient-to-br from-amber to-amber-deep text-[11px] font-medium text-primary-foreground">
                      {session.user?.name?.[0]?.toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[120px] truncate font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {session.user?.name}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="rounded-full border-border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-foreground transition-colors duration-200 hover:border-invert hover:bg-invert hover:text-invert-foreground"
                >
                  Sign Out
                </Button>
              </div>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:bg-scrim-3 hover:text-foreground"
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button
                  size="sm"
                  className="rounded-full bg-primary px-5 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-primary-foreground shadow-none hover:bg-amber-light"
                >
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
