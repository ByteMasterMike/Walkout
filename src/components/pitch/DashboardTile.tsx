import Link from 'next/link';
import { cn } from '@/lib/utils';

export function DashboardTile({
  href,
  corner,
  icon,
  title,
  titleEm,
  description,
  className,
}: {
  href: string;
  corner: string;
  icon: React.ReactNode;
  title: string;
  titleEm: string;
  description: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn('card tap tile-big block no-underline hover:no-underline', className)}>
      <span className="corner">{corner}</span>
      <div className="icon">{icon}</div>
      <h3>
        {title} <em>{titleEm}</em>
      </h3>
      <p>{description}</p>
    </Link>
  );
}
