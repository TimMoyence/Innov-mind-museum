import { useAdminLocale } from './admin-dictionary';

export type DateLocaleTag = 'fr-FR' | 'en-US';

/**
 * Resolves the BCP-47 locale tag from the admin app's locale state.
 * Use this instead of inline `isFr ? 'fr-FR' : 'en-US'` checks.
 */
export function useDateLocale(): DateLocaleTag {
  return useAdminLocale() === 'fr' ? 'fr-FR' : 'en-US';
}

/**
 * Formats a Date or ISO string into a localized date string.
 * Pass options matching Intl.DateTimeFormatOptions.
 */
export function formatDate(
  d: Date | string,
  locale: DateLocaleTag,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Date(d).toLocaleDateString(locale, opts);
}

/**
 * Formats a Date or ISO string into a short date+time string.
 * Equivalent to `dateStyle: 'short', timeStyle: 'short'`.
 */
export function formatDateTime(d: Date | string, locale: DateLocaleTag): string {
  return new Date(d).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}
