/**
 * SEC/CSRF (F7 2026-04-30) — OWASP "Double Submit Cookie" with HMAC binding.
 *
 * Contract:
 *   csrf_token cookie == HMAC-SHA256(access_token, CSRF_SECRET)
 *   AND X-CSRF-Token header == csrf_token cookie
 * HMAC binding defeats token fixation — attacker can't pair matching cookie+header
 * without both the access token AND server's CSRF_SECRET.
 *
 * Skip rules:
 *   - SAFE_METHODS (GET/HEAD/OPTIONS, RFC 9110 §9.2.1)
 *   - Authorization: Bearer (mobile/SPA — browsers don't auto-send Authorization
 *     cross-origin). MUST be checked BEFORE cookie probe — iOS URLSession persists
 *     access_token cookies from prior responses even with Bearer auth (incident
 *     2026-05-08: social-login 403 CSRF_INVALID for cookies mobile never opted into)
 *   - PRE_AUTH_PATHS — verify creds fresh, never trust existing cookie
 *   - No access_token cookie — anonymous; nothing to forge against
 *
 * Validation uses `timingSafeEqual` over equal-length buffers — prevents string-cmp timing leaks.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from '@shared/errors/app.error';
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

/**
 * SEC: constant-time string equality. `timingSafeEqual` throws on length mismatch
 * (which itself leaks length info) — pad to equal length + AND with length-equal flag.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  const len = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  const eq = timingSafeEqual(aPad, bPad);
  return eq && aBuf.length === bBuf.length;
}

/** @throws AppError 403 CSRF_INVALID. */
export function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  // SEC: Bearer skip MUST precede cookie probe (see header docstring + incident 2026-05-08).
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  if (PRE_AUTH_PATHS.has(req.path)) {
    next();
    return;
  }

  // @types/express-serve-static-core types `cookies` as `any` — narrow locally.
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

  if (!safeEqual(csrfCookie, headerValue)) {
    throw csrfInvalid();
  }

  // SEC HMAC binding: cookie MUST be derived from active access token, not arbitrary.
  const expected = computeCsrfToken(accessTokenCookie);
  if (!safeEqual(csrfCookie, expected)) {
    throw csrfInvalid();
  }

  next();
}
