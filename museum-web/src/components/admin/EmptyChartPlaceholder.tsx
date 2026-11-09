interface EmptyChartPlaceholderProps {
  label: string;
  height?: number;
}

export function EmptyChartPlaceholder({ label, height = 300 }: EmptyChartPlaceholderProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className="mt-4 flex items-center justify-center rounded-lg bg-surface-muted/40 text-sm text-text-muted"
      style={{ height }}
    >
      {label}
    </div>
  );
}
