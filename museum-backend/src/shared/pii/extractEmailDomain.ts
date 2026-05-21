/**
 * GDPR Art. 5(1)(c) data-minimisation helper (A1).
 *
 * Returns the domain portion of an email address (everything after the LAST `@`),
 * lower-cased, for use in logs and audit metadata where the full address must not
 * be retained. Pure: no logger, no IO, no framework imports.
 *
 *   'Alice@Example.COM'              -> 'example.com'
 *   'a@b@c.com'                      -> 'c.com'        (substring after the LAST '@')
 *   'secret.local-part@example.com'  -> 'example.com'  (never leaks the local part)
 *   'no-at-sign' / '' / '   ' / 'x@' -> 'unknown'       (safe non-PII fallback)
 */

/** Non-PII fallback when no resolvable domain can be extracted. */
const FALLBACK = 'unknown';

export const extractEmailDomain = (email: string): string => {
  const trimmed = email.trim();
  const lastAt = trimmed.lastIndexOf('@');
  if (lastAt === -1) return FALLBACK;

  const domain = trimmed.slice(lastAt + 1).toLowerCase();
  if (domain.length === 0) return FALLBACK;

  return domain;
};
