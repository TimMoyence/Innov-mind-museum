import {
  setAuthCookies,
  type CookieSessionInput,
} from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_LOGIN_FAILED,
  AUDIT_AUTH_LOGIN_SUCCESS,
  AUDIT_SECURITY_RATE_LIMIT,
} from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';

import { auditOwnAccount } from './auth-route.helpers';

import type { Request, Response } from 'express';

interface LoginSuccessSession extends CookieSessionInput {
  user: { id: number };
}

export async function finalizeLoginSuccess(
  req: Request,
  res: Response,
  session: LoginSuccessSession,
): Promise<void> {
  await auditOwnAccount(req, session.user.id, AUDIT_AUTH_LOGIN_SUCCESS);
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
