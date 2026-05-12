/** Locales supported by the Musaium product surface (BE + Web + Mobile). */
export const SUPPORTED_LOCALES = ['fr', 'en'] as const;

/** Type union of the supported locales — use as `Locale` in app code. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Default locale when no Accept-Language / body override is provided. */
export const DEFAULT_LOCALE: Locale = 'fr';

/** Type guard narrowing an unknown string to `Locale`. */
export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
