import {
  byIp,
  byUserId,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';

import { decodeFamilyIdUnsafe, toPositiveInt } from './auth-route.helpers';

import type { RequestHandler } from 'express';

/** /register — IP-keyed bucket (5 req / 10 min default). */
export const registerLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_REGISTER_RATE_LIMIT, 5),
  windowMs: toPositiveInt(process.env.AUTH_REGISTER_RATE_WINDOW_MS, 600_000),
  keyGenerator: byIp,
});

/** /login — coarse IP-keyed bucket (10 req / 5 min default). */
export const loginLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT, 10),
  windowMs: toPositiveInt(process.env.AUTH_LOGIN_RATE_WINDOW_MS, 300_000),
  keyGenerator: byIp,
});

/**
 * /login — per-account bucket sitting in front of {@link loginLimiter}. Catches
 * CGNAT bypass: when many users share an IP, the IP bucket is too coarse to
 * detect "one account being hammered from dozens of distinct IPs". Returns 429
 * before the password compare so the response shape doesn't leak which
 * accounts exist (UFR — keep enumeration oracle closed).
 */
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

/**
 * F1 — /refresh limiter keyed by IP+familyId. familyId is decoded best-effort
 * from the JWT body without verifying the signature (verification happens
 * later in the handler). Falls back to IP-only when the token is malformed so
 * a parse failure cannot bypass the limit.
 */
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

/** /social-login + /social-nonce — IP+provider bucket. */
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

/** /change-email — per-user bucket. */
export const changeEmailLimiter: RequestHandler = createRateLimitMiddleware({
  limit: 5,
  windowMs: 300_000,
  keyGenerator: byUserId,
});

/** /verify-email + /confirm-email-change — IP-keyed bucket. */
export const emailVerificationLimiter: RequestHandler = createRateLimitMiddleware({
  limit: 10,
  windowMs: 300_000,
  keyGenerator: byIp,
});

/** /forgot-password + /reset-password — IP-keyed bucket. */
export const passwordResetLimiter: RequestHandler = createRateLimitMiddleware({
  limit: 5,
  windowMs: 300_000,
  keyGenerator: byIp,
});

/** /api-keys — per-user bucket. */
export const apiKeyLimiter: RequestHandler = createRateLimitMiddleware({
  limit: 10,
  windowMs: 60_000,
  keyGenerator: byUserId,
});
