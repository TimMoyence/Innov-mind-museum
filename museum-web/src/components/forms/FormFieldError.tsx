/**
 * Per-field validation error message.
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p1 — replaces the inline
 * `<p className="mt-1 text-{xs,sm} text-red-{600,700}">{errors.field}</p>`
 * pattern duplicated across 14 form field sites.
 *
 * - Pure presentational component (no hooks).
 * - Strict empty contract: renders `null` for `undefined | null | ''` (U-R18.3).
 *   No placeholder, no empty wrapper.
 * - Accessible: emits `role="alert"` and accepts an `id` prop so the consuming
 *   `<input>` can associate it via `aria-describedby` (NFR-A11Y-4).
 * - Default Tailwind classes: `mt-1 text-sm text-red-700`. When a `className`
 *   override is supplied the default is NOT merged (design §1.5 default-OR-override).
 */

interface FormFieldErrorProps {
  id?: string;
  error?: string;
  className?: string;
}

const DEFAULT_CLASSES = 'mt-1 text-sm text-red-700';

export function FormFieldError({ id, error, className }: FormFieldErrorProps) {
  if (!error) return null;

  return (
    <p id={id} role="alert" className={className ?? DEFAULT_CLASSES}>
      {error}
    </p>
  );
}
