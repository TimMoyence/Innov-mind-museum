import {
  setAuthCookies,
  type CookieSessionInput,
} from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_LOGIN_FAILED,
  AUDIT_AUTH_LOGIN_SUCCESS,
  AUDIT_MFA_WARNING_STARTED,
  AUDIT_SECURITY_RATE_LIMIT,
} from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { env } from '@src/config/env';

import type { Request, Response } from 'express';

interface LoginSuccessSession extends CookieSessionInput {
  user: { id: number };
  mfaWarningDaysRemaining?: number;
}

/** Audit chain (MFA warning on anchor login + LOGIN_SUCCESS) + dual-mode cookies. */
export async function finalizeLoginSuccess(
  req: Request,
  res: Response,
  session: LoginSuccessSession,
): Promise<void> {
  if (
    session.mfaWarningDaysRemaining !== undefined &&
    session.mfaWarningDaysRemaining === env.auth.mfaEnrollmentWarningDays
  ) {
    await auditService.log({
      action: AUDIT_MFA_WARNING_STARTED,
      actorType: 'user',
      actorId: session.user.id,
      targetType: 'user',
      targetId: String(session.user.id),
      metadata: { daysRemaining: session.mfaWarningDaysRemaining },
      ip: req.ip,
      requestId: req.requestId,
    });
  }
  await auditService.log({
    action: AUDIT_AUTH_LOGIN_SUCCESS,
    actorType: 'user',
    actorId: session.user.id,
    targetType: 'user',
    targetId: String(session.user.id),
    ip: req.ip,
    requestId: req.requestId,
  });
  // F7 — dual-mode: JSON envelope (mobile) + httpOnly cookies (web). JSON unchanged.
  setAuthCookies(res, session);
}

/** Silent for non-AppError — global error handler still logs/forwards. */
export async function auditLoginError(req: Request, error: unknown): Promise<void> {
  if (!(error instanceof AppError)) return;
  const email = (req.body as { email?: unknown } | undefined)?.email;
  // A1 / GDPR Art. 5(1)(c): never write the raw email into audit metadata — only
  // the domain (actorId/targetId/ip/requestId retain forensic identification).
  const emailDomain = typeof email === 'string' ? extractEmailDomain(email) : undefined;
  if (error.code === 'INVALID_CREDENTIALS') {
    await auditService.log({
      action: AUDIT_AUTH_LOGIN_FAILED,
      actorType: 'anonymous',
      metadata: { emailDomain },
      ip: req.ip,
      requestId: req.requestId,
    });
    return;
  }
  if (error.code === 'TOO_MANY_REQUESTS') {
    await auditService.log({
      action: AUDIT_SECURITY_RATE_LIMIT,
      actorType: 'anonymous',
      metadata: { emailDomain, endpoint: '/login' },
      ip: req.ip,
      requestId: req.requestId,
    });
  }
}
