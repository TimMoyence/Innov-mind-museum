/**
 * F7 (2026-04-30) — CSRF double-submit token middleware.
 *
 * Threat model: cookie-authenticated browsers auto-send the `access_token`
 * cookie on cross-origin POSTs. Without a per-session token bound to that
 * cookie an attacker page can trigger state-changing requests. Mitigation
 * follows OWASP Session Management Cheat Sheet ("Double Submit Cookie"):
 *
 *   csrf_token cookie value MUST equal HMAC-SHA256(access_token, CSRF_SECRET)
 *   AND
 *   X-CSRF-Token request header MUST equal csrf_token cookie value
 *
 * The HMAC binding defeats "token fixation" — an attacker cannot supply a
 * matching cookie+header pair without knowing both the access token AND the
 * server's CSRF_SECRET.
 *
 * Skip rules (no CSRF needed):
 *   - GET / HEAD / OPTIONS — read-only, no state change
 *   - No `access_token` cookie — request authenticates via Bearer (mobile) or
 *     anonymously; browsers do not auto-send Authorization headers, so no CSRF
 *     vector exists.
 *
 * Validation uses `crypto.timingSafeEqual` against equal-length buffers to
 * prevent string-comparison timing leaks.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { NextFunction, Request, Response } from 'express';

/** Methods that never trigger CSRF validation (RFC 9110 §9.2.1 safe methods). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfInvalid = (): AppError =>
  new AppError({
    message: 'CSRF token invalid or missing.',
    statusCode: 403,
    code: 'CSRF_INVALID',
  });

/** Computes the expected CSRF token bound to a given access-token cookie. */
export function computeCsrfToken(
  accessToken: string,
  secret: string = env.auth.csrfSecret,
): string {
  return createHmac('sha256', secret).update(accessToken).digest('hex');
}

/**
 * Constant-time equality on two ascii strings of arbitrary lengths.
 *
 * `crypto.timingSafeEqual` throws on length mismatch (which itself leaks
 * length information). Padding to equal length and ANDing with a length-equal
 * flag preserves constant-time behaviour for inputs of any size.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  // Pad the shorter buffer with zeros so timingSafeEqual sees equal lengths.
  const len = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  const eq = timingSafeEqual(aPad, bPad);
  return eq && aBuf.length === bBuf.length;
}

/**
 * Express middleware: validates the CSRF double-submit token on
 * cookie-authenticated state-changing requests. Throws an AppError that the
 * global error handler maps to `403 CSRF_INVALID`.
 */
export function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const cookies = req.cookies;
  const accessTokenCookie = cookies.access_token;
  // No cookie session ⇒ Bearer/mobile or anonymous; CSRF doesn't apply.
  if (!accessTokenCookie) {
    next();
    return;
  }

  const csrfCookie = cookies.csrf_token;
  if (!csrfCookie) {
    throw csrfInvalid();
  }

  const headerToken = req.headers['x-csrf-token'];
  const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (typeof headerValue !== 'string' || !headerValue) {
    throw csrfInvalid();
  }

  if (!safeEqual(csrfCookie, headerValue)) {
    throw csrfInvalid();
  }

  // HMAC binding: the cookie MUST be derived from the active access token,
  // not just an arbitrary value the attacker echoed in both places.
  const expected = computeCsrfToken(accessTokenCookie);
  if (!safeEqual(csrfCookie, expected)) {
    throw csrfInvalid();
  }

  next();
}
