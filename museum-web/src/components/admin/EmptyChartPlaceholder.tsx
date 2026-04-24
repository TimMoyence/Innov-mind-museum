/**
 * Lightweight placeholder for admin charts when the underlying dataset is
 * empty (or all-zero). Styling mirrors the existing topArtworks fallback
 * so the visual language stays consistent across the analytics page.
 *
 * Accessibility: uses `role="status"` so screen readers announce the empty
 * state without it being an error. Pair with a descriptive `label` that
 * callers source from `adminDict.common.noData` (or a more specific key).
 */
interface EmptyChartPlaceholderProps {
  /** Translated empty-state label (e.g. `adminDict.common.noData`). */
  label: string;
  /** Height in pixels — matches the chart container so layout does not jump. */
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
