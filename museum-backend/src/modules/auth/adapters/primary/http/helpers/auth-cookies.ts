import { computeCsrfToken } from '@shared/middleware/csrf.middleware';
import { env } from '@src/config/env';

import type { Response, CookieOptions, RequestHandler } from 'express';

export interface CookieSessionInput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export const REFRESH_COOKIE_PATH = '/api/auth';

const isProduction = (): boolean => env.nodeEnv === 'production';

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/',
  };
}

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

export const refreshTokenFromCookie: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as { refreshToken?: unknown };
  const cookie = (req.cookies as Record<string, string | undefined> | undefined)?.refresh_token;
  if (body.refreshToken === undefined && cookie) {
    req.body = { ...body, refreshToken: cookie };
  }
  next();
};

export function clearAuthCookies(res: Response): void {
  const base = baseCookieOptions();

  res.clearCookie('access_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie('csrf_token', { ...base, httpOnly: false, path: '/' });
}
