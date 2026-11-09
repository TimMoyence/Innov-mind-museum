import { extractLangCode } from '@shared/i18n/locale';

export type EmailLocale = 'fr' | 'en';

export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'fr';

export function resolveEmailLocale(input: unknown): EmailLocale {
  if (typeof input !== 'string') return DEFAULT_EMAIL_LOCALE;
  if (input === 'en') return 'en';
  if (input === 'fr') return 'fr';
  if (/[-_]/.test(input)) {
    const lang = extractLangCode(input);
    if (lang === 'en') return 'en';
    if (lang === 'fr') return 'fr';
  }
  return DEFAULT_EMAIL_LOCALE;
}

export function localeFromAcceptLanguage(header: string | undefined): EmailLocale {
  if (!header) return DEFAULT_EMAIL_LOCALE;
  const normalized = header.slice(0, 256).toLowerCase();
  const enIdx = normalized.search(/\ben\b/);
  const frIdx = normalized.search(/\bfr\b/);
  if (enIdx >= 0 && (frIdx < 0 || enIdx < frIdx)) return 'en';
  return DEFAULT_EMAIL_LOCALE;
}
