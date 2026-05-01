import { type NextFunction, type Request, type Response, Router } from 'express';

import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_LOGIN_SUCCESS,
  AUDIT_AUTH_LOGIN_FAILED,
  AUDIT_AUTH_LOGOUT,
  AUDIT_AUTH_REGISTER,
  AUDIT_AUTH_SOCIAL_LOGIN,
  AUDIT_AUTH_PASSWORD_CHANGE,
  AUDIT_AUTH_PASSWORD_RESET_REQUEST,
  AUDIT_AUTH_PASSWORD_RESET,
  AUDIT_AUTH_EMAIL_VERIFIED,
  AUDIT_ACCOUNT_DELETED,
  AUDIT_API_KEY_CREATED,
  AUDIT_API_KEY_REVOKED,
  AUDIT_SECURITY_RATE_LIMIT,
  AUDIT_AUTH_EMAIL_CHANGE_REQUEST,
  AUDIT_AUTH_EMAIL_CHANGE_CONFIRMED,
  AUDIT_AUTH_ONBOARDING_COMPLETED,
  AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED,
  AUDIT_MFA_WARNING_STARTED,
} from '@shared/audit/audit.types';
import {
  type EmailLocale,
  localeFromAcceptLanguage,
  resolveEmailLocale,
} from '@shared/email/email-locale';
import { AppError, badRequest } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { env } from '@src/config/env';
import {
  isAuthenticated,
  isAuthenticatedJwtOnly,
} from '@src/helpers/middleware/authenticated.middleware';
import {
  createRateLimitMiddleware,
  byUserId,
  byIp,
} from '@src/helpers/middleware/rate-limit.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

import { clearAuthCookies, setAuthCookies } from './auth-cookies';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  socialLoginSchema,
  changePasswordSchema,
  changeEmailSchema,
  confirmEmailChangeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  createApiKeySchema,
  updateContentPreferencesSchema,
} from './auth.schemas';
import {
  authSessionService,
  forgotPasswordUseCase,
  registerUseCase,
  resetPasswordUseCase,
  socialLoginUseCase,
  nonceStore,
  deleteAccountUseCase,
  getProfileUseCase,
  changePasswordUseCase,
  changeEmailUseCase,
  confirmEmailChangeUseCase,
  verifyEmailUseCase,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
  listApiKeysUseCase,
  updateContentPreferencesUseCase,
  completeOnboarding,
} from '../../../useCase';

/**
 * Express router for authentication endpoints (register, login, refresh, logout, social-login,
 * forgot/reset password, account deletion, and current-user retrieval).
 */
const authRouter: Router = Router();

/**
 * Pick the email locale for outgoing transactional emails.
 *
 * Priority order:
 *   1. Explicit `locale` field in the request body (validated by Zod → `'fr' | 'en'`).
 *   2. `Accept-Language` header (simple fr/en heuristic).
 *   3. Default (`'fr'`).
 */
function pickEmailLocale(req: Request): EmailLocale {
  const bodyLocale = (req.body as { locale?: unknown }).locale;
  if (bodyLocale === 'fr' || bodyLocale === 'en') {
    return resolveEmailLocale(bodyLocale);
  }
  return localeFromAcceptLanguage(req.headers['accept-language']);
}

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const registerLimiter = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_REGISTER_RATE_LIMIT, 5),
  windowMs: toPositiveInt(process.env.AUTH_REGISTER_RATE_WINDOW_MS, 600_000),
  keyGenerator: byIp,
});

const loginLimiter = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT, 10),
  windowMs: toPositiveInt(process.env.AUTH_LOGIN_RATE_WINDOW_MS, 300_000),
  keyGenerator: byIp,
});

// Phase F (2026-04-30) — per-attempted-account limiter on /login. Sits in front of
// the existing per-IP loginLimiter and catches CGNAT bypass: when many users share
// one IP, the IP bucket is too coarse to detect "one account being hammered from
// dozens of distinct IPs". Bucket key = email-after-normalisation. Returns 429
// before the password compare so the response shape doesn't leak which accounts
// exist (UFR — keep enumeration oracle closed).
const loginByAccountLimiter = createRateLimitMiddleware({
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

// F1 — refresh limiter keyed by IP+familyId. Decoded best-effort from the JWT body
// without verifying the signature (verification happens later in the handler). Falls
// back to IP-only when the token is malformed so a parse failure cannot bypass the
// limit.
const decodeFamilyIdUnsafe = (token: string | undefined): string | null => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      familyId?: unknown;
    };
    return typeof payload.familyId === 'string' ? payload.familyId : null;
  } catch {
    return null;
  }
};

const refreshLimiter = createRateLimitMiddleware({
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

const socialLoginLimiter = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_SOCIAL_LOGIN_RATE_LIMIT, 10),
  windowMs: toPositiveInt(process.env.AUTH_SOCIAL_LOGIN_RATE_WINDOW_MS, 60_000),
  keyGenerator: (req) => {
    const ip = byIp(req);
    const provider = (req.body as { provider?: unknown } | undefined)?.provider;
    return typeof provider === 'string' ? `${ip}:${provider}` : ip;
  },
  bucketName: 'auth-social-login',
});

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    const { email, password, firstname, lastname } = req.body;
    const locale = pickEmailLocale(req);
    const user = await registerUseCase.execute(email, password, firstname, lastname, locale);
    await auditService.log({
      action: AUDIT_AUTH_REGISTER,
      actorType: 'user',
      actorId: user.id,
      targetType: 'user',
      targetId: String(user.id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ user: { id: user.id, email: user.email } });
  },
);

authRouter.post(
  '/login',
  loginLimiter,
  loginByAccountLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await authSessionService.login(email, password);

      // R16 — handle the three login envelope shapes.
      if ('mfaRequired' in result) {
        // Enrolled admin must complete the second factor; nothing privileged
        // happened yet, so emit no LOGIN_SUCCESS audit row.
        res.status(200).json(result);
        return;
      }

      if ('mfaEnrollmentRequired' in result) {
        // Past warning deadline: deny session issuance with a 403 carrying
        // the redirect hint. 403 is intentional — login *failed* in the
        // sense that no JWTs were issued, even though the password was
        // correct.
        res.status(403).json(result);
        return;
      }

      // Happy path. Audit success + emit MFA warning audit on the first
      // login that anchored the deadline (recognised by the days-remaining
      // value being exactly the configured maximum).
      const session = result;
      if (
        session.mfaWarningDaysRemaining !== undefined &&
        session.mfaWarningDaysRemaining === env.auth.mfaEnrollmentWarningDays
      ) {
        await auditService.log({
          action: AUDIT_MFA_WARNING_STARTED,
          actorType: 'user',
          actorId: session.user.id,
          targetType: 'user',
          targetId: String(session.user.id),
          metadata: { daysRemaining: session.mfaWarningDaysRemaining },
          ip: req.ip,
          requestId: req.requestId,
        });
      }
      await auditService.log({
        action: AUDIT_AUTH_LOGIN_SUCCESS,
        actorType: 'user',
        actorId: session.user.id,
        targetType: 'user',
        targetId: String(session.user.id),
        ip: req.ip,
        requestId: req.requestId,
      });
      // F7 — dual-mode: emit BOTH the JSON envelope (mobile reads it) AND the
      // httpOnly cookies (web reads them). JSON shape unchanged.
      setAuthCookies(res, session);
      res.status(200).json(session);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') {
        await auditService.log({
          action: AUDIT_AUTH_LOGIN_FAILED,
          actorType: 'anonymous',
          metadata: { email: req.body?.email },
          ip: req.ip,
          requestId: req.requestId,
        });
      }
      if (error instanceof AppError && error.code === 'TOO_MANY_REQUESTS') {
        await auditService.log({
          action: AUDIT_SECURITY_RATE_LIMIT,
          actorType: 'anonymous',
          metadata: { email: req.body?.email, endpoint: '/login' },
          ip: req.ip,
          requestId: req.requestId,
        });
      }
      next(error);
    }
  },
);

authRouter.post(
  '/refresh',
  refreshLimiter,
  validateBody(refreshSchema),
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const session = await authSessionService.refresh(refreshToken);
    // F7 — refresh the cookies in lockstep with the rotated tokens. JSON
    // envelope kept verbatim for mobile.
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

authRouter.post('/logout', validateBody(logoutSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  await authSessionService.logout(refreshToken);
  await auditService.log({
    action: AUDIT_AUTH_LOGOUT,
    actorType: 'anonymous',
    ip: req.ip,
    requestId: req.requestId,
  });
  // F7 — clear all three cookies regardless of how the client authenticated.
  // No-op on mobile (no cookies to clear).
  clearAuthCookies(res);
  res.status(200).json({ success: true });
});

authRouter.get('/me', isAuthenticated, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const profile = await getProfileUseCase.execute(jwtUser.id);
  if (!profile) {
    throw new AppError({ message: 'User not found', statusCode: 401, code: 'UNAUTHORIZED' });
  }

  res.status(200).json({
    user: {
      id: profile.id,
      email: profile.email,
      firstname: profile.firstname ?? null,
      lastname: profile.lastname ?? null,
      role: profile.role,
      onboardingCompleted: profile.onboardingCompleted,
      contentPreferences: profile.contentPreferences,
    },
  });
});

authRouter.patch(
  '/content-preferences',
  isAuthenticated,
  validateBody(updateContentPreferencesSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { preferences } = req.body;
    const result = await updateContentPreferencesUseCase.execute(jwtUser.id, preferences);
    await auditService.log({
      action: AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      metadata: { preferences: result.contentPreferences },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ contentPreferences: result.contentPreferences });
  },
);

authRouter.post(
  '/social-login',
  socialLoginLimiter,
  validateBody(socialLoginSchema),
  async (req: Request, res: Response) => {
    const { provider, idToken, nonce } = req.body;
    const session = await socialLoginUseCase.execute(provider, idToken, nonce);
    await auditService.log({
      action: AUDIT_AUTH_SOCIAL_LOGIN,
      actorType: 'user',
      actorId: session.user.id,
      targetType: 'user',
      targetId: String(session.user.id),
      metadata: { provider },
      ip: req.ip,
      requestId: req.requestId,
    });
    // F7 — same dual-mode emission as /login.
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

// F3 — issue a server-bound nonce for the next /social-login attempt. Rate
// limited (same bucket parameters as /social-login) so an attacker cannot
// burn through the entropy pool or hammer Redis. No body required.
authRouter.post('/social-nonce', socialLoginLimiter, async (_req: Request, res: Response) => {
  const issuedNonce = await nonceStore.issue();
  res.status(200).json({ nonce: issuedNonce });
});

authRouter.delete('/account', isAuthenticated, async (req: Request, res: Response) => {
  const user = requireUser(req);
  await auditService.log({
    action: AUDIT_ACCOUNT_DELETED,
    actorType: 'user',
    actorId: user.id,
    targetType: 'user',
    targetId: String(user.id),
    ip: req.ip,
    requestId: req.requestId,
  });
  await deleteAccountUseCase.execute(user.id);
  res.status(200).json({ deleted: true });
});

authRouter.put(
  '/change-password',
  isAuthenticated,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { currentPassword, newPassword } = req.body;
    await changePasswordUseCase.execute(jwtUser.id, currentPassword, newPassword);
    await auditService.log({
      action: AUDIT_AUTH_PASSWORD_CHANGE,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ message: 'Password changed successfully.' });
  },
);

const changeEmailLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 300_000,
  keyGenerator: byUserId,
});

authRouter.put(
  '/change-email',
  isAuthenticated,
  changeEmailLimiter,
  validateBody(changeEmailSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { newEmail, currentPassword } = req.body;
    const locale = pickEmailLocale(req);
    const token = await changeEmailUseCase.execute(jwtUser.id, newEmail, currentPassword, locale);
    await auditService.log({
      action: AUDIT_AUTH_EMAIL_CHANGE_REQUEST,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      metadata: { newEmail },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({
      message: 'A confirmation email has been sent to the new address.',
      // SEC-HARDENING (L7): debug token only surfaces in the test environment.
      // Leaking it in dev (which can point at shared staging DBs) would enable
      // account takeover via log inspection.
      ...(env.nodeEnv === 'test' ? { debugToken: token } : {}),
    });
  },
);

const emailVerificationLimiter = createRateLimitMiddleware({
  limit: 10,
  windowMs: 300_000,
  keyGenerator: byIp,
});

authRouter.post(
  '/confirm-email-change',
  emailVerificationLimiter,
  validateBody(confirmEmailChangeSchema),
  async (req: Request, res: Response) => {
    const { token } = req.body;
    const result = await confirmEmailChangeUseCase.execute(token);
    await auditService.log({
      action: AUDIT_AUTH_EMAIL_CHANGE_CONFIRMED,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  },
);

const passwordResetLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 300_000,
  keyGenerator: byIp,
});

authRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const locale = pickEmailLocale(req);
    const token = await forgotPasswordUseCase.execute(email, locale);
    await auditService.log({
      action: AUDIT_AUTH_PASSWORD_RESET_REQUEST,
      actorType: 'anonymous',
      metadata: { email },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({
      message: 'If this email exists, a reset link has been sent.',
      // SEC-HARDENING (L7): debug token only surfaces in the test environment
      // (see /change-email above for rationale).
      ...(env.nodeEnv === 'test' ? { debugResetToken: token } : {}),
    });
  },
);

authRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    await resetPasswordUseCase.execute(token, newPassword);
    await auditService.log({
      action: AUDIT_AUTH_PASSWORD_RESET,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ message: 'Password updated successfully.' });
  },
);

authRouter.post(
  '/verify-email',
  emailVerificationLimiter,
  validateBody(verifyEmailSchema),
  async (req: Request, res: Response) => {
    const { token } = req.body;
    const result = await verifyEmailUseCase.execute(token);
    await auditService.log({
      action: AUDIT_AUTH_EMAIL_VERIFIED,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  },
);

authRouter.patch('/onboarding-complete', isAuthenticated, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  await completeOnboarding(jwtUser.id);
  await auditService.log({
    action: AUDIT_AUTH_ONBOARDING_COMPLETED,
    actorType: 'user',
    actorId: jwtUser.id,
    targetType: 'user',
    targetId: String(jwtUser.id),
    ip: req.ip,
    requestId: req.requestId,
  });
  res.status(204).end();
});

// ─── API Key Management (B2B) ─── gated behind feature flag ───
const apiKeyLimiter = createRateLimitMiddleware({
  limit: 10,
  windowMs: 60_000,
  keyGenerator: byUserId,
});

// API key routes — always mounted (B2B API key programme).
authRouter.post(
  '/api-keys',
  isAuthenticatedJwtOnly,
  apiKeyLimiter,
  validateBody(createApiKeySchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { name, expiresAt } = req.body;
    const expiry = expiresAt ? new Date(expiresAt) : undefined;
    const result = await generateApiKeyUseCase.execute(jwtUser.id, name, expiry);
    await auditService.log({
      action: AUDIT_API_KEY_CREATED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'api_key',
      targetId: result.apiKey.prefix,
      metadata: { name },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json(result);
  },
);

authRouter.get('/api-keys', isAuthenticatedJwtOnly, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const result = await listApiKeysUseCase.execute(jwtUser.id);
  res.status(200).json(result);
});

authRouter.delete('/api-keys/:id', isAuthenticatedJwtOnly, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const keyId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(keyId)) {
    throw badRequest('Invalid API key ID');
  }
  const result = await revokeApiKeyUseCase.execute(keyId, jwtUser.id);
  await auditService.log({
    action: AUDIT_API_KEY_REVOKED,
    actorType: 'user',
    actorId: jwtUser.id,
    targetType: 'api_key',
    targetId: String(keyId),
    ip: req.ip,
    requestId: req.requestId,
  });
  res.status(200).json(result);
});

export default authRouter;
