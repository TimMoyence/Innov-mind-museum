import { authSessionService } from '@modules/auth/useCase';
import { AppError } from '@shared/errors/app.error';
import { setUser } from '@shared/observability/sentry';

import { validateApiKey } from './apiKey.middleware';

import type { Request, Response, NextFunction } from 'express';

const unauthorized = (message: string): AppError =>
  new AppError({ message, statusCode: 401, code: 'UNAUTHORIZED' });

/**
 * Resolves the credential carried by the request.
 *
 * F7 (2026-04-30) — dual auth: Bearer header (mobile, takes precedence) OR
 * `access_token` cookie (web admin). When both are present, Bearer wins so
 * mobile webviews carrying a stray cookie cannot accidentally swap identity.
 */
function resolveCredential(req: Request): { token: string; source: 'bearer' | 'cookie' } | null {
  const bearer = req.headers.authorization?.split(' ')[1];
  if (bearer) {
    return { token: bearer, source: 'bearer' };
  }
  const cookieToken = req.cookies?.access_token;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return { token: cookieToken, source: 'cookie' };
  }
  return null;
}

/**
 * Extracts and validates the access token from either the `Authorization`
 * Bearer header (mobile) or the `access_token` cookie (web admin, F7).
 *
 * If a Bearer token starts with `msk_`, it routes to the B2B API-key path.
 * Cookie-borne tokens are always treated as JWTs (cookies never carry API
 * keys; the cookie path is exclusively for browser sessions and a stray
 * `msk_*` value would indicate tampering).
 *
 * @throws {401} if no credential is present or verification fails.
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
  const credential = resolveCredential(req);
  if (!credential) {
    throw unauthorized('Token required');
  }

  const { token, source } = credential;

  // API-key path is Bearer-only. Cookie path is JWT-only.
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

/**
 * Middleware that only allows JWT authentication (no API keys).
 * Used for sensitive endpoints like API key management itself.
 */
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
