import {
  byIp,
  byUserId,
  createRateLimitMiddleware,
} from '@shared/middleware/rate-limit.middleware';
import { toPositiveInt } from '@src/config/env-helpers';

import { decodeFamilyIdUnsafe } from './auth-route.helpers';

import type { RequestHandler } from 'express';

export const registerLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_REGISTER_RATE_LIMIT, 5),
  windowMs: toPositiveInt(process.env.AUTH_REGISTER_RATE_WINDOW_MS, 600_000),
  keyGenerator: byIp,
});

export const loginLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT, 10),
  windowMs: toPositiveInt(process.env.AUTH_LOGIN_RATE_WINDOW_MS, 300_000),
  keyGenerator: byIp,
});

export const loginByAccountLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_LOGIN_ACCOUNT_RATE_LIMIT, 20),
  windowMs: toPositiveInt(process.env.AUTH_LOGIN_ACCOUNT_RATE_WINDOW_MS, 5 * 60_000),
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' && email.length > 0
      ? `email:${email.trim().toLowerCase()}`
      : `email:unknown`;
  },
  bucketName: 'auth-login-account',
});

export const refreshLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_REFRESH_RATE_LIMIT, 30),
  windowMs: toPositiveInt(process.env.AUTH_REFRESH_RATE_WINDOW_MS, 60_000),
  keyGenerator: (req) => {
    const ip = byIp(req);
    const refreshToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    const familyId = decodeFamilyIdUnsafe(
      typeof refreshToken === 'string' ? refreshToken : undefined,
    );
    return familyId ? `${ip}:${familyId}` : ip;
  },
  bucketName: 'auth-refresh',
});

export const logoutLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_LOGOUT_RATE_LIMIT, 30),
  windowMs: toPositiveInt(process.env.AUTH_LOGOUT_RATE_WINDOW_MS, 60_000),
  keyGenerator: byIp,
  bucketName: 'auth-logout',
});

export const socialLoginLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_SOCIAL_LOGIN_RATE_LIMIT, 10),
  windowMs: toPositiveInt(process.env.AUTH_SOCIAL_LOGIN_RATE_WINDOW_MS, 60_000),
  keyGenerator: (req) => {
    const ip = byIp(req);
    const provider = (req.body as { provider?: unknown } | undefined)?.provider;
    return typeof provider === 'string' ? `${ip}:${provider}` : ip;
  },
  bucketName: 'auth-social-login',
});

export const changeEmailLimiter: RequestHandler = createRateLimitMiddleware({
  limit: 5,
  windowMs: 300_000,
  keyGenerator: byUserId,
});

export const emailVerificationLimiter: RequestHandler = createRateLimitMiddleware({
  limit: 10,
  windowMs: 300_000,
  keyGenerator: byIp,
});

export const passwordResetLimiter: RequestHandler = createRateLimitMiddleware({
  limit: 5,
  windowMs: 300_000,
  keyGenerator: byIp,
});
