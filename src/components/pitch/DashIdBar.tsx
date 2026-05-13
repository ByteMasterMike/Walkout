export function DashIdBar({ label = 'Restaurant ID', id }: { label?: string; id: string }) {
  return (
    <div className="dash-id">
      <span className="mono">{label}</span>
      <span className="break-all text-right font-mono text-[11px] text-muted-foreground">{id}</span>
    </div>
  );
}
