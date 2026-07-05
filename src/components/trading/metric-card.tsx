export function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{props.label}</div>
      <div className="mt-2 text-lg font-semibold">{props.value}</div>
    </div>
  );
}
