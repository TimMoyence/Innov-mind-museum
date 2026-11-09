import { useAdminLocale } from './admin-dictionary';

export type DateLocaleTag = 'fr-FR' | 'en-US';

export function useDateLocale(): DateLocaleTag {
  return useAdminLocale() === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatDate(
  d: Date | string,
  locale: DateLocaleTag,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Date(d).toLocaleDateString(locale, opts);
}

export function formatDateTime(d: Date | string, locale: DateLocaleTag): string {
  return new Date(d).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}
