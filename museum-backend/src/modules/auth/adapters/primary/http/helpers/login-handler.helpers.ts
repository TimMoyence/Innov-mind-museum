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
import { env } from '@src/config/env';

import type { Request, Response } from 'express';

interface LoginSuccessSession extends CookieSessionInput {
  user: { id: number };
  mfaWarningDaysRemaining?: number;
}

/**
 * Emits the audit chain for a successful login (MFA warning on first login
 * that anchored the deadline + LOGIN_SUCCESS) and sets dual-mode auth cookies.
 */
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
  // F7 — dual-mode: emit BOTH the JSON envelope (mobile reads it) AND the
  // httpOnly cookies (web reads them). JSON shape unchanged.
  setAuthCookies(res, session);
}

/**
 * Emits LOGIN_FAILED / RATE_LIMIT audits when the login error matches a
 * known AppError code. Silent for any other error type — the global error
 * handler still logs and forwards the response.
 */
export async function auditLoginError(req: Request, error: unknown): Promise<void> {
  if (!(error instanceof AppError)) return;
  const email = (req.body as { email?: unknown } | undefined)?.email;
  const emailMeta = typeof email === 'string' ? email : undefined;
  if (error.code === 'INVALID_CREDENTIALS') {
    await auditService.log({
      action: AUDIT_AUTH_LOGIN_FAILED,
      actorType: 'anonymous',
      metadata: { email: emailMeta },
      ip: req.ip,
      requestId: req.requestId,
    });
    return;
  }
  if (error.code === 'TOO_MANY_REQUESTS') {
    await auditService.log({
      action: AUDIT_SECURITY_RATE_LIMIT,
      actorType: 'anonymous',
      metadata: { email: emailMeta, endpoint: '/login' },
      ip: req.ip,
      requestId: req.requestId,
    });
  }
}
