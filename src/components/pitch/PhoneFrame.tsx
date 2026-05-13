'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

function StatusBar() {
  const [time, setTime] = React.useState('9:41');
  React.useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes();
      const am = h < 12;
      const hr = h % 12 || 12;
      setTime(`${hr}:${String(m).padStart(2, '0')} ${am ? 'AM' : 'PM'}`);
    };
    fmt();
    const t = setInterval(fmt, 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="statusbar max-lg:hidden">
      <span>{time}</span>
      <span className="opacity-80">●●● ▮▮▮</span>
    </div>
  );
}

export function PhoneFrame({
  children,
  className,
  responsive = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Full-bleed on small viewports; device chrome on xl+ */
  responsive?: boolean;
}) {
  return (
    <div
      className={cn(
        'phone',
        responsive &&
          'max-lg:mt-0 max-lg:h-auto max-lg:min-h-[calc(100vh-1px)] max-lg:w-full max-lg:max-w-none max-lg:rounded-none max-lg:shadow-none',
        className,
      )}
    >
      <div className="island max-lg:hidden" aria-hidden />
      <StatusBar />
      <div className="home-indicator max-lg:hidden" aria-hidden />
      <div
        className={cn(
          'screen on',
          responsive && 'max-lg:!relative max-lg:!inset-auto max-lg:!flex max-lg:!p-4 max-lg:!pb-28',
        )}
      >
        {children}
      </div>
    </div>
  );
}
