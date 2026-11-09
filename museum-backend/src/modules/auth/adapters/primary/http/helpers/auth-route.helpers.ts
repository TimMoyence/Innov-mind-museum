import { z } from 'zod';

import { auditService } from '@shared/audit';
import { decodeJwtPayload } from '@shared/auth/jwt-decode';
import {
  type EmailLocale,
  localeFromAcceptLanguage,
  resolveEmailLocale,
} from '@shared/email/email-locale';
import { extractLangCode } from '@shared/i18n/locale';

import type { Request } from 'express';

export function auditOwnAccount(
  req: Request,
  userId: number,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  return auditService.log({
    action,
    actorType: 'user',
    actorId: userId,
    targetType: 'user',
    targetId: String(userId),
    ...(metadata === undefined ? {} : { metadata }),
    ip: req.ip,
    requestId: req.requestId,
  });
}

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

const familyIdPayloadSchema = z.object({ familyId: z.string() });

export const decodeFamilyIdUnsafe = (token: string | undefined): string | null => {
  const payload = decodeJwtPayload(token, familyIdPayloadSchema);
  return payload?.familyId ?? null;
};
