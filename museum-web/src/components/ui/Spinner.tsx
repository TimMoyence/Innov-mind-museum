/**
 * Stateless spinner indicator.
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p1 — replaces the historical Tailwind
 * composite `h-8 w-8 animate-spin rounded-full border-4 border-primary-500
 * border-t-transparent` that was duplicated across 11 admin / auth sites.
 *
 * - Pure presentational component (no hooks — UB-1).
 * - CSS-only animation via Tailwind `animate-spin` (NFR-PERF-1, U-R12.4).
 * - `role="status"` + accessible label (NFR-A11Y-1 / U-R12.3).
 * - Locale-agnostic: label is injected by the caller, with an English fallback
 *   "Loading…" used only when no `label` is provided (NFR-I18N-1).
 */

type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-4',
  lg: 'h-12 w-12 border-4',
};

const COMMON_CLASSES =
  'inline-block animate-spin rounded-full border-primary-500 border-t-transparent';

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  const accessibleLabel = label ?? 'Loading…';
  const classes = [sizeClasses[size], COMMON_CLASSES, className].filter(Boolean).join(' ');

  return (
    <span role="status" aria-label={accessibleLabel} className={classes}>
      <span className="sr-only">{accessibleLabel}</span>
    </span>
  );
}
