// Email locale helpers. Transactional emails embed museum-web links at
// `/[locale]/...` — without the prefix, Next.js 301 → 404 (segment required).
// Single source of locale resolution across all useCases.

/** Mirrors museum-web `[locale]` segment. */
export type EmailLocale = 'fr' | 'en';

export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'fr';

/** Falls back to {@link DEFAULT_EMAIL_LOCALE} unless exact `'fr'` or `'en'`. */
export function resolveEmailLocale(input: unknown): EmailLocale {
  if (input === 'en') return 'en';
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
