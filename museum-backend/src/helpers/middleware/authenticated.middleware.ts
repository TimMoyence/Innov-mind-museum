import { Request, Response, NextFunction } from 'express';
import { authSessionService } from '@modules/auth/core/useCase';
import { env } from '@src/config/env';
import { validateApiKey } from './apiKey.middleware';

/**
 * Extracts and validates the Bearer token from the Authorization header.
 * Supports dual auth: if the token starts with `msk_` and the API key feature flag
 * is enabled, routes to API key validation; otherwise uses JWT.
 * @throws {401} if token is missing or invalid.
 */
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    return;
  }

  // Route to API key validation if the token has the msk_ prefix
  if (token.startsWith('msk_') && env.featureFlags.apiKeys) {
    validateApiKey(token, req, res, next).catch(next);
    return;
  }

  try {
    const user = authSessionService.verifyAccessToken(token);
    (req as Request & { user?: { id: number } }).user = { id: user.id };
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}

/**
 * Middleware that only allows JWT authentication (no API keys).
 * Used for sensitive endpoints like API key management itself.
 */
export function isAuthenticatedJwtOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    return;
  }

  if (token.startsWith('msk_')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'JWT authentication required for this endpoint' } });
    return;
  }

  try {
    const user = authSessionService.verifyAccessToken(token);
    (req as Request & { user?: { id: number } }).user = { id: user.id };
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}
