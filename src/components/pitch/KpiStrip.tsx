import { cn } from '@/lib/utils';

export type KpiItem = {
  label: string;
  value: React.ReactNode;
  /** e.g. trend line — arbitrary node */
  detail?: React.ReactNode;
  detailClass?: string;
};

export function KpiCard({ item }: { item: KpiItem }) {
  return (
    <div className="kpi">
      <div className="l">{item.label}</div>
      <div className="v">{item.value}</div>
      {item.detail != null ? (
        <div className={cn('d', item.detailClass)}>{item.detail}</div>
      ) : null}
    </div>
  );
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-strip">
      {items.map((item, i) => (
        <KpiCard key={i} item={item} />
      ))}
    </div>
  );
}
