import { cn } from '@/lib/utils';

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn('page', className)}>{children}</section>;
}
