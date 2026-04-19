/**
 * Email locale helpers.
 *
 * Transactional emails (verify-email, reset-password, confirm-email-change) embed
 * links pointing to the museum-web frontend, whose routes live under `/[locale]/...`.
 * Without the locale prefix, Next.js responds with a 301 → 404 because the locale
 * segment is required. This module centralises locale resolution so every useCase
 * builds URLs the same way.
 */

/** Supported email locales. Mirrors the museum-web `[locale]` segment. */
export type EmailLocale = 'fr' | 'en';

/** Default locale when the caller did not provide one. */
export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'fr';

/**
 * Coerce an arbitrary input (request body field) into a valid {@link EmailLocale}.
 * Falls back to {@link DEFAULT_EMAIL_LOCALE} when the input is anything other than
 * the exact strings `'fr'` or `'en'`.
 */
export function resolveEmailLocale(input: unknown): EmailLocale {
  if (input === 'en') return 'en';
  if (input === 'fr') return 'fr';
  return DEFAULT_EMAIL_LOCALE;
}

/**
 * Parse an `Accept-Language` header and return the preferred email locale.
 *
 * Uses a simple heuristic: if `en` appears in the header and either `fr` is absent
 * or appears earlier, return `'en'`. Otherwise return the default (`'fr'`).
 *
 * Intentionally minimal — only two locales are supported, so a full RFC 4647
 * language-range matcher would be overkill. The output is constrained by
 * {@link EmailLocale}, so the function is safe to embed in URLs.
 *
 * Hardening:
 * - Input capped at 256 chars (defensive — Accept-Language above this is pathological).
 * - Word-boundary match rejects substrings like `entrepreneur` or `frankfurt`.
 */
export function localeFromAcceptLanguage(header: string | undefined): EmailLocale {
  if (!header) return DEFAULT_EMAIL_LOCALE;
  const normalized = header.slice(0, 256).toLowerCase();
  const enIdx = normalized.search(/\ben\b/);
  const frIdx = normalized.search(/\bfr\b/);
  if (enIdx >= 0 && (frIdx < 0 || enIdx < frIdx)) return 'en';
  return DEFAULT_EMAIL_LOCALE;
}
