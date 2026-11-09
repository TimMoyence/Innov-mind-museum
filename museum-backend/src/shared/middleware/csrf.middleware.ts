import { createHmac } from 'node:crypto';

import { AppError } from '@shared/errors/app.error';
import { sameSecret } from '@shared/security/same-secret';
import { env } from '@src/config/env';

import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const PRE_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/social-login',
  '/api/auth/social-nonce',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
]);

const csrfInvalid = (): AppError =>
  new AppError({
    message: 'CSRF token invalid or missing.',
    statusCode: 403,
    code: 'CSRF_INVALID',
  });

export function computeCsrfToken(
  accessToken: string,
  secret: string = env.auth.csrfSecret,
): string {
  return createHmac('sha256', secret).update(accessToken).digest('hex');
}

export function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  if (PRE_AUTH_PATHS.has(req.path)) {
    next();
    return;
  }

  const cookies = req.cookies as Record<string, string | undefined>;
  const accessTokenCookie = cookies.access_token;
  if (!accessTokenCookie) {
    next();
    return;
  }

  const csrfCookie = cookies.csrf_token;
  if (!csrfCookie) {
    throw csrfInvalid();
  }

  const headerValue = req.header('x-csrf-token');
  if (!headerValue) {
    throw csrfInvalid();
  }

  if (!sameSecret(csrfCookie, headerValue)) {
    throw csrfInvalid();
  }

  const expected = computeCsrfToken(accessTokenCookie);
  if (!sameSecret(csrfCookie, expected)) {
    throw csrfInvalid();
  }

  next();
}
