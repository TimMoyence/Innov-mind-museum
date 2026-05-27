import { z } from 'zod';

import { decodeJwtPayload } from '@shared/auth/jwt-decode';
import {
  type EmailLocale,
  localeFromAcceptLanguage,
  resolveEmailLocale,
} from '@shared/email/email-locale';
import { extractLangCode } from '@shared/i18n/locale';

import type { Request } from 'express';

/**
 * Priority: body.locale (fr/en only — transactional emails ship in 2 locales,
 * other SupportedLocale values fall through rather than fail) → Accept-Language
 * (fr/en heuristic) → default 'fr'. Region-tagged body locales (`en-US`) are
 * matched by their `extractLangCode` subtag so a regionalised English user is
 * not silently downgraded to the French Accept-Language fallthrough.
 */
export function pickEmailLocale(req: Request): EmailLocale {
  const bodyLocale = (req.body as { locale?: unknown }).locale;
  if (typeof bodyLocale === 'string') {
    const lang = extractLangCode(bodyLocale);
    if (lang === 'en' || lang === 'fr') {
      return resolveEmailLocale(bodyLocale);
    }
  }
  return localeFromAcceptLanguage(req.headers['accept-language']);
}

/** Parses an env-var string into a positive integer, falling back on invalid input. */
export const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Decodes `familyId` from refresh JWT WITHOUT verifying signature. Used by
 * refresh rate limiter to bucket per-family before crypto verify in handler.
 * Parse failure cannot bypass — caller falls back to IP-only keying.
 */
const familyIdPayloadSchema = z.object({ familyId: z.string() });

export const decodeFamilyIdUnsafe = (token: string | undefined): string | null => {
  const payload = decodeJwtPayload(token, familyIdPayloadSchema);
  return payload?.familyId ?? null;
};
