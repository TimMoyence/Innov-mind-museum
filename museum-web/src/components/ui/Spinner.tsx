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
