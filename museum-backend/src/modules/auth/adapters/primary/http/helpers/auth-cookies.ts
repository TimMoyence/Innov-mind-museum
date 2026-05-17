/**
 * F7 — Web admin cookie-auth flow (mobile unaffected — JSON body unchanged).
 *   - `access_token`   HttpOnly, TTL = accessToken
 *   - `refresh_token`  HttpOnly, Path=/api/auth, TTL = refresh idle window
 *   - `csrf_token`     NOT HttpOnly (JS reads to echo via X-CSRF-Token),
 *                      value = HMAC-SHA256(access_token, CSRF_SECRET)
 */

import { computeCsrfToken } from '@shared/middleware/csrf.middleware';
import { env } from '@src/config/env';

import type { Response, CookieOptions } from 'express';

export interface CookieSessionInput {
  accessToken: string;
  refreshToken: string;
  /** Seconds — drives `Max-Age` on access_token + csrf_token. */
  expiresIn: number;
  /** Seconds — drives `Max-Age` on refresh_token. */
  refreshExpiresIn: number;
}

/** Only sent on /api/auth/* routes. */
export const REFRESH_COOKIE_PATH = '/api/auth';

const isProduction = (): boolean => env.nodeEnv === 'production';

/**
 * `Secure` enforced in prod (HTTPS only), dropped in dev/test so localhost
 * works. `SameSite=Strict` — web admin served from same origin as API behind
 * reverse proxy, tightest first-party setting.
 */
function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/',
  };
}

/**
 * Idempotent — safe to call multiple times per response (later wins).
 * Defensive: missing/non-numeric TTL → session cookie (no `Max-Age`), keeps
 * back-compat with call sites pre-F7.
 */
export function setAuthCookies(res: Response, session: CookieSessionInput): void {
  const accessMaxAgeMs = Number.isFinite(session.expiresIn)
    ? Math.max(0, session.expiresIn) * 1000
    : undefined;
  const refreshMaxAgeMs = Number.isFinite(session.refreshExpiresIn)
    ? Math.max(0, session.refreshExpiresIn) * 1000
    : undefined;
  const base = baseCookieOptions();

  res.cookie('access_token', session.accessToken, {
    ...base,
    ...(accessMaxAgeMs !== undefined ? { maxAge: accessMaxAgeMs } : {}),
  });

  res.cookie('refresh_token', session.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    ...(refreshMaxAgeMs !== undefined ? { maxAge: refreshMaxAgeMs } : {}),
  });

  res.cookie('csrf_token', computeCsrfToken(session.accessToken), {
    ...base,
    httpOnly: false,
    ...(accessMaxAgeMs !== undefined ? { maxAge: accessMaxAgeMs } : {}),
  });
}

/** Mirrors {@link setAuthCookies} paths. */
export function clearAuthCookies(res: Response): void {
  const base = baseCookieOptions();

  res.clearCookie('access_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie('csrf_token', { ...base, httpOnly: false, path: '/' });
}
