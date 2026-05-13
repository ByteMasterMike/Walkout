'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

export type SegmentedItem = {
  href: string;
  label: string;
  active: boolean;
};

export function SegmentedNav({ items, className }: { items: SegmentedItem[]; className?: string }) {
  return (
    <nav className={cn('top-nav', className)} aria-label="Primary modes">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(item.active && 'on')}
          prefetch={item.href.startsWith('/#') ? false : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
