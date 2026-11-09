type AlertVariant = 'error' | 'success' | 'info';

export interface AlertBannerProps {
  variant: AlertVariant;
  message: string;
  className?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  error: 'bg-red-50 text-red-700',
  success: 'bg-green-50 text-green-700',
  info: 'bg-blue-50 text-blue-700',
};

const variantRoles: Record<AlertVariant, 'alert' | 'status'> = {
  error: 'alert',
  success: 'alert',
  info: 'status',
};

const SHARED_CLASSES = 'rounded-lg px-4 py-3 text-sm';

export function AlertBanner({ variant, message, className }: AlertBannerProps) {
  const classes = [SHARED_CLASSES, variantClasses[variant], className].filter(Boolean).join(' ');

  return (
    <div role={variantRoles[variant]} className={classes}>
      {message}
    </div>
  );
}
