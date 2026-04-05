import { authSessionService } from '@modules/auth/useCase';
import { AppError } from '@shared/errors/app.error';
import { setUser } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import { validateApiKey } from './apiKey.middleware';

import type { Request, Response, NextFunction } from 'express';

const unauthorized = (message: string): AppError =>
  new AppError({ message, statusCode: 401, code: 'UNAUTHORIZED' });

/**
 * Extracts and validates the Bearer token from the Authorization header.
 * Supports dual auth: if the token starts with `msk_` and the API key feature flag
 * is enabled, routes to API key validation; otherwise uses JWT.
 *
 * @throws {401} if token is missing or invalid.
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    throw unauthorized('Token required');
  }

  // Route to API key validation if the token has the msk_ prefix
  if (token.startsWith('msk_') && env.featureFlags.apiKeys) {
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
