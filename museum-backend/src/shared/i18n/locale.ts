export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_TO_LANGUAGE: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Chinese',
  ar: 'Arabic',
};

export function isSupportedLocale(s: string): s is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(s);
}

export const extractLangCode = (raw: string): string => {
  return raw.toLowerCase().split(/[-_]/)[0];
};

export function resolveLocale(candidates: (string | undefined | null)[]): SupportedLocale {
  for (const raw of candidates) {
    if (!raw) continue;
    const code = extractLangCode(raw);
    if (isSupportedLocale(code)) return code;
  }
  return 'en';
}

export function localeToLanguageName(locale: SupportedLocale): string {
  return LOCALE_TO_LANGUAGE[locale];
}

export function parseAcceptLanguageHeader(header?: string): string | undefined {
  if (!header) return undefined;

  const first = header
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .find(Boolean);

  return nonEmpty(first);
}
import { nonEmpty } from '@shared/utils/defaults';
