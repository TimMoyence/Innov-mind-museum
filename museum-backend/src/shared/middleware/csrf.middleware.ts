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
 *   - `Authorization: Bearer …` header present — request authenticates via
 *     Bearer (mobile / SPA). Browsers do not auto-send Authorization headers
 *     cross-origin, so the request is not forgeable by an attacker page. The
 *     stray `access_token` cookie that iOS URLSession persists from prior
 *     responses is irrelevant when Bearer is the active credential.
 *   - Pre-auth endpoints (login, register, social-login, social-nonce,
 *     refresh, forgot-password, reset-password, verify-email) — these do
 *     not trust the existing cookie for authentication; they verify creds
 *     fresh and issue new tokens. iOS URLSession may auto-send a stale
 *     access_token cookie inherited from a prior session, which would
 *     otherwise trip the cookie-auth branch even though the route never
 *     reads that cookie.
 *   - No `access_token` cookie — request authenticates anonymously; nothing
 *     to forge against.
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

/**
 * Pre-auth endpoints exempt from CSRF validation. These routes verify
 * credentials fresh (login/register/social) or echo a server-bound token
 * (refresh / verify-email / forgot-reset-password) and never trust the
 * existing cookie for authentication. A stale cookie auto-sent by iOS
 * URLSession therefore cannot be weaponised against them.
 */
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

  // Authorization Bearer ⇒ mobile / SPA path. Browsers do not auto-send
  // Authorization headers cross-origin, so CSRF is moot. Checked BEFORE the
  // cookie probe because iOS URLSession persists `access_token` cookies from
  // previous responses even when the app authenticates via Bearer (incident
  // 2026-05-08 — social-login 403 CSRF_INVALID for cookies the mobile client
  // never opted into).
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // Pre-auth endpoints don't trust the existing cookie for authentication —
  // see header docstring. Same incident 2026-05-08 root cause as the Bearer
  // skip above.
  if (PRE_AUTH_PATHS.has(req.path)) {
    next();
    return;
  }

  // @types/express-serve-static-core types `cookies` as `any`; cast locally to
  // the shape that `cookieParserMiddleware` produces (parsed string values).
  const cookies = req.cookies as Record<string, string | undefined>;
  const accessTokenCookie = cookies.access_token;
  // No cookie session ⇒ anonymous; CSRF doesn't apply.
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

  // HMAC binding: the cookie MUST be derived from the active access token,
  // not just an arbitrary value the attacker echoed in both places.
  const expected = computeCsrfToken(accessTokenCookie);
  if (!safeEqual(csrfCookie, expected)) {
    throw csrfInvalid();
  }

  next();
}
