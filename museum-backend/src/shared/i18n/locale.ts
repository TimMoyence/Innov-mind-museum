export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh'] as const;
/** Union type of all supported two-letter locale codes. */
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_TO_LANGUAGE: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Chinese',
};

/** Type guard that checks whether a string is a supported locale code. */
export function isSupportedLocale(s: string): s is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(s);
}

/**
 * Extracts the two-letter language code from a locale string (e.g. "fr-FR" → "fr").
 */
const extractLangCode = (raw: string): string => {
  return raw.toLowerCase().split(/[-_]/)[0];
};

/**
 * Resolves the first supported locale from a list of candidates.
 * Each candidate can be a full locale tag (e.g. "fr-FR"), a bare language code ("fr"),
 * or undefined/null. Falls back to "en" when no candidate matches.
 */
export function resolveLocale(candidates: (string | undefined | null)[]): SupportedLocale {
  for (const raw of candidates) {
    if (!raw) continue;
    const code = extractLangCode(raw);
    if (isSupportedLocale(code)) return code;
  }
  return 'en';
}

/**
 * Returns the full English language name for a given supported locale.
 */
export function localeToLanguageName(locale: SupportedLocale): string {
  return LOCALE_TO_LANGUAGE[locale];
}

/**
 * Parses the `Accept-Language` header and returns the raw first-preference tag.
 * Returns undefined when the header is missing or empty.
 */
export function parseAcceptLanguageHeader(header?: string): string | undefined {
  if (!header) return undefined;

  const first = header
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .find(Boolean);

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
  return first || undefined;
}
