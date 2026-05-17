import { authSessionService } from '@modules/auth/useCase';
import { AppError } from '@shared/errors/app.error';
import { setUser } from '@shared/observability/sentry';

import { validateApiKey } from './apiKey.middleware';

import type { Request, Response, NextFunction } from 'express';

const unauthorized = (message: string): AppError =>
  new AppError({ message, statusCode: 401, code: 'UNAUTHORIZED' });

/**
 * SEC F7 dual auth: Bearer (mobile, precedence) OR `access_token` cookie (web admin).
 * Bearer wins when both present → mobile webviews carrying stray cookies can't swap identity.
 */
function resolveCredential(req: Request): { token: string; source: 'bearer' | 'cookie' } | null {
  const bearer = req.headers.authorization?.split(' ')[1];
  if (bearer) {
    return { token: bearer, source: 'bearer' };
  }
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const cookieToken = cookies?.access_token;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return { token: cookieToken, source: 'cookie' };
  }
  return null;
}

/**
 * `msk_` Bearer → B2B API-key path. Cookie tokens always JWTs (cookies never carry API keys;
 * stray `msk_*` cookie value indicates tampering).
 *
 * @throws {Error} 401 on missing/invalid credential.
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
  const credential = resolveCredential(req);
  if (!credential) {
    throw unauthorized('Token required');
  }

  const { token, source } = credential;

  if (source === 'bearer' && token.startsWith('msk_')) {
    validateApiKey(token, req, res, next).catch(next);
    return;
  }

  try {
    const user = authSessionService.verifyAccessToken(token);
    req.user = { id: user.id, role: user.role, museumId: user.museumId };
    req.museumId = user.museumId ?? undefined;
    setUser({ id: String(user.id) });
    next();
  } catch {
    throw unauthorized('Invalid token');
  }
}

/** SEC: JWT-only — used by sensitive endpoints (API key management itself). */
export function isAuthenticatedJwtOnly(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    throw unauthorized('Token required');
  }

  if (token.startsWith('msk_')) {
    throw unauthorized('JWT authentication required for this endpoint');
  }

  try {
    const user = authSessionService.verifyAccessToken(token);
    req.user = { id: user.id, role: user.role, museumId: user.museumId };
    req.museumId = user.museumId ?? undefined;
    setUser({ id: String(user.id) });
    next();
  } catch {
    throw unauthorized('Invalid token');
  }
}
