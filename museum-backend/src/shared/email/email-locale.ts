// Email locale helpers. Transactional emails embed museum-web links at
// `/[locale]/...` — without the prefix, Next.js 301 → 404 (segment required).
// Single source of locale resolution across all useCases.

import { extractLangCode } from '@shared/i18n/locale';

/** Mirrors museum-web `[locale]` segment. */
export type EmailLocale = 'fr' | 'en';

export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'fr';

/**
 * Maps a locale tag to the 2 email locales (fr/en), else {@link DEFAULT_EMAIL_LOCALE}.
 * Region tags (`en-US`, `fr-FR`) are normalised via {@link extractLangCode} so a
 * regionalised English user gets English mail. Bare tags stay strict-lowercase
 * ('EN'/'FR' → default) since `extractLangCode` lowercases — only the presence of
 * a `-`/`_` separator authorises normalisation.
 */
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

/**
 * Parse Accept-Language. Heuristic: `en` present AND (no `fr` OR `en` earlier)
 * → 'en'. Hardening: input capped 256 chars; word-boundary match rejects
 * substrings like `entrepreneur` / `frankfurt`.
 */
export function localeFromAcceptLanguage(header: string | undefined): EmailLocale {
  if (!header) return DEFAULT_EMAIL_LOCALE;
  const normalized = header.slice(0, 256).toLowerCase();
  const enIdx = normalized.search(/\ben\b/);
  const frIdx = normalized.search(/\bfr\b/);
  if (enIdx >= 0 && (frIdx < 0 || enIdx < frIdx)) return 'en';
  return DEFAULT_EMAIL_LOCALE;
}
