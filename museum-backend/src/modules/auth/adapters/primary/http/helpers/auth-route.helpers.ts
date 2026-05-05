import {
  type EmailLocale,
  localeFromAcceptLanguage,
  resolveEmailLocale,
} from '@shared/email/email-locale';

import type { Request } from 'express';

/**
 * Pick the email locale for outgoing transactional emails.
 *
 * Priority order:
 *   1. Explicit `locale` field in the request body (validated by Zod → `'fr' | 'en'`).
 *   2. `Accept-Language` header (simple fr/en heuristic).
 *   3. Default (`'fr'`).
 */
export function pickEmailLocale(req: Request): EmailLocale {
  const bodyLocale = (req.body as { locale?: unknown }).locale;
  if (bodyLocale === 'fr' || bodyLocale === 'en') {
    return resolveEmailLocale(bodyLocale);
  }
  return localeFromAcceptLanguage(req.headers['accept-language']);
}

/** Parses an env-var string into a positive integer, falling back on invalid input. */
export const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Decodes the `familyId` claim from a refresh-token JWT WITHOUT verifying the
 * signature. Used by the refresh rate limiter to bucket per-family before the
 * cryptographic verification runs in the handler. A parse failure cannot
 * bypass the limit because the caller falls back to IP-only keying.
 */
export const decodeFamilyIdUnsafe = (token: string | undefined): string | null => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      familyId?: unknown;
    };
    return typeof payload.familyId === 'string' ? payload.familyId : null;
  } catch {
    return null;
  }
};
