/**
 * F7 (2026-04-30) — Auth cookie helpers.
 *
 * Issues / clears the three cookies that back the web admin's cookie-auth
 * flow:
 *   - `access_token`   HttpOnly, short TTL (matches accessToken)
 *   - `refresh_token`  HttpOnly, Path=/api/auth (not sent on every API call),
 *                      TTL = refresh idle window
 *   - `csrf_token`     NOT HttpOnly (web JS must read it to echo back via
 *                      X-CSRF-Token), value = HMAC-SHA256(access_token, CSRF_SECRET)
 *
 * Mobile is unaffected — the JSON response body still carries
 * `{ accessToken, refreshToken, ... }` exactly as before. Web reads from
 * cookies (post follow-up web PR), mobile reads from JSON.
 */

import { env } from '@src/config/env';
import { computeCsrfToken } from '@src/helpers/middleware/csrf.middleware';

import type { Response, CookieOptions } from 'express';

/** Minimum shape we need from a session response to set cookies. */
export interface CookieSessionInput {
  accessToken: string;
  refreshToken: string;
  /** Access-token TTL in seconds — drives the `Max-Age` on access_token + csrf_token. */
  expiresIn: number;
  /** Refresh-token TTL in seconds — drives the `Max-Age` on refresh_token. */
  refreshExpiresIn: number;
}

/** Path scoping for the refresh cookie — only sent on /api/auth/* routes. */
export const REFRESH_COOKIE_PATH = '/api/auth';

const isProduction = (): boolean => env.nodeEnv === 'production';

/**
 * Base options shared by every auth cookie. `Secure` is enforced in production
 * (HTTPS only) and dropped in dev/test so http://localhost works unchanged.
 *
 * `SameSite=Strict` blocks every cross-site send — the web admin is served
 * from the same origin as the API behind a reverse proxy, so this is the
 * tightest setting that still works for first-party use.
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
 * Sets the three auth cookies on the response. Idempotent — safe to call
 * multiple times in the same response cycle (later call wins).
 *
 * Defensive: when a TTL is missing or non-numeric (legacy callers, partial
 * mocks in tests), the cookie is still emitted but as a session cookie (no
 * `Max-Age`). This keeps the dual-mode contract while gracefully handling
 * call sites that pre-date the F7 envelope change.
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

/** Clears all three auth cookies (logout). Mirrors {@link setAuthCookies} paths. */
export function clearAuthCookies(res: Response): void {
  const base = baseCookieOptions();

  res.clearCookie('access_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie('csrf_token', { ...base, httpOnly: false, path: '/' });
}
