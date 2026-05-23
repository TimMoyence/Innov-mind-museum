/**
 * Inline alert banner (error / success / info).
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p1 — replaces the inline
 * `<div className="rounded-{md,lg} bg-{red,green}-50 px-4 py-3 text-sm
 * text-{red,green}-700">…</div>` pattern duplicated across 18 form / admin sites.
 *
 * - Pure presentational component (no hooks).
 * - Accessible: `role="alert"` for error/success (assertive live region),
 *   `role="status"` for info (NFR-A11Y-2, U-R14.3).
 * - Differentiated by role + textual message (NFR-A11Y-3 — never colour-only).
 * - Text content only — `dangerouslySetInnerHTML` is forbidden (UB-2).
 * - i18n: `message` is fully caller-owned (NFR-I18N-1/2).
 */

type AlertVariant = 'error' | 'success' | 'info';

interface AlertBannerProps {
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
