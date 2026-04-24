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
  AUDIT_DATA_EXPORT,
  AUDIT_API_KEY_CREATED,
  AUDIT_API_KEY_REVOKED,
  AUDIT_SECURITY_RATE_LIMIT,
  AUDIT_AUTH_EMAIL_CHANGE_REQUEST,
  AUDIT_AUTH_EMAIL_CHANGE_CONFIRMED,
  AUDIT_AUTH_ONBOARDING_COMPLETED,
  AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED,
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
  deleteAccountUseCase,
  exportUserDataUseCase,
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

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    const { email, password, firstname, lastname } = req.body;
    const locale = pickEmailLocale(req);
    const user = await registerUseCase.execute(email, password, firstname, lastname, locale);
    auditService.log({
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
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const session = await authSessionService.login(email, password);
      auditService.log({
        action: AUDIT_AUTH_LOGIN_SUCCESS,
        actorType: 'user',
        actorId: session.user.id,
        targetType: 'user',
        targetId: String(session.user.id),
        ip: req.ip,
        requestId: req.requestId,
      });
      res.status(200).json(session);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') {
        auditService.log({
          action: AUDIT_AUTH_LOGIN_FAILED,
          actorType: 'anonymous',
          metadata: { email: req.body?.email },
          ip: req.ip,
          requestId: req.requestId,
        });
      }
      if (error instanceof AppError && error.code === 'TOO_MANY_REQUESTS') {
        auditService.log({
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

authRouter.post('/refresh', validateBody(refreshSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const session = await authSessionService.refresh(refreshToken);
  res.status(200).json(session);
});

authRouter.post('/logout', validateBody(logoutSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  await authSessionService.logout(refreshToken);
  auditService.log({
    action: AUDIT_AUTH_LOGOUT,
    actorType: 'anonymous',
    ip: req.ip,
    requestId: req.requestId,
  });
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
    auditService.log({
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
  validateBody(socialLoginSchema),
  async (req: Request, res: Response) => {
    const { provider, idToken } = req.body;
    const session = await socialLoginUseCase.execute(provider, idToken);
    auditService.log({
      action: AUDIT_AUTH_SOCIAL_LOGIN,
      actorType: 'user',
      actorId: session.user.id,
      targetType: 'user',
      targetId: String(session.user.id),
      metadata: { provider },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json(session);
  },
);

authRouter.delete('/account', isAuthenticated, async (req: Request, res: Response) => {
  const user = requireUser(req);
  auditService.log({
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

authRouter.get('/export-data', isAuthenticated, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const profile = await getProfileUseCase.execute(jwtUser.id);
  if (!profile) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    return;
  }

  const result = await exportUserDataUseCase.execute({
    id: profile.id,
    email: profile.email,
    firstname: profile.firstname,
    lastname: profile.lastname,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
  auditService.log({
    action: AUDIT_DATA_EXPORT,
    actorType: 'user',
    actorId: jwtUser.id,
    targetType: 'user',
    targetId: String(jwtUser.id),
    ip: req.ip,
    requestId: req.requestId,
  });
  res.json(result);
});

authRouter.put(
  '/change-password',
  isAuthenticated,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { currentPassword, newPassword } = req.body;
    await changePasswordUseCase.execute(jwtUser.id, currentPassword, newPassword);
    auditService.log({
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
    auditService.log({
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
    auditService.log({
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
    auditService.log({
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
    auditService.log({
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
    auditService.log({
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
  auditService.log({
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
    auditService.log({
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
  auditService.log({
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
