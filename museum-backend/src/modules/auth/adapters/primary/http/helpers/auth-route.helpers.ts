
import { z } from 'zod';

import { decodeJwtPayload } from '@shared/auth/jwt-decode';
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
 *   1. Explicit `locale` field in the request body. The Zod schemas accept any
 *      `SupportedLocale` (8 user locales incl. 'ar'), but transactional emails
 *      ship in only fr/en today — anything other than `'fr' | 'en'` falls
 *      through to the next step rather than failing the request.
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
const familyIdPayloadSchema = z.object({ familyId: z.string() });

export const decodeFamilyIdUnsafe = (token: string | undefined): string | null => {
  const payload = decodeJwtPayload(token, familyIdPayloadSchema);
  return payload?.familyId ?? null;
};
