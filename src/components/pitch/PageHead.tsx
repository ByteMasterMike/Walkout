import { cn } from '@/lib/utils';

export function PageHeadMetaDot() {
  return <span className="dot" aria-hidden />;
}

export function PageHead({
  title,
  subtitle,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('page-head', className)}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <div className="sub">{subtitle}</div> : null}
      </div>
      {actions != null ? (
        <div className="flex shrink-0 flex-wrap items-end justify-end gap-3">{actions}</div>
      ) : meta != null ? (
        <div className="meta">{meta}</div>
      ) : null}
    </div>
  );
}
