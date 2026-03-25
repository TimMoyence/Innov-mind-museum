import { NextFunction, Request, Response, Router } from 'express';
import { isAuthenticated, isAuthenticatedJwtOnly } from '@src/helpers/middleware/authenticated.middleware';
import { createRateLimitMiddleware, byUserId, byIp } from '@src/helpers/middleware/rate-limit.middleware';
import { env } from '@src/config/env';
import { AppError, badRequest } from '@shared/errors/app.error';
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
} from '@shared/audit/audit.types';
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
  verifyEmailUseCase,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
  listApiKeysUseCase,
} from '../../../core/useCase';

/**
 * Express router for authentication endpoints (register, login, refresh, logout, social-login,
 * forgot/reset password, account deletion, and current-user retrieval).
 */
const authRouter: Router = Router();

const registerLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 600_000,
  keyGenerator: byIp,
});

const loginLimiter = createRateLimitMiddleware({
  limit: 10,
  windowMs: 300_000,
  keyGenerator: byIp,
});

authRouter.post('/register', registerLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstname, lastname } = req.body;
    const user = await registerUseCase.execute(email, password, firstname, lastname);
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
  } catch (error) { next(error); }
});

authRouter.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    const session = await authSessionService.login(email || '', password || '');
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
        metadata: { email: (req.body || {}).email },
        ip: req.ip,
        requestId: req.requestId,
      });
    }
    if (error instanceof AppError && error.code === 'TOO_MANY_REQUESTS') {
      auditService.log({
        action: AUDIT_SECURITY_RATE_LIMIT,
        actorType: 'anonymous',
        metadata: { email: (req.body || {}).email, endpoint: '/login' },
        ip: req.ip,
        requestId: req.requestId,
      });
    }
    next(error);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = (req.body || {}) as { refreshToken?: string };
    const session = await authSessionService.refresh(refreshToken || '');
    res.status(200).json(session);
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = (req.body || {}) as { refreshToken?: string };
    await authSessionService.logout(refreshToken);
    auditService.log({
      action: AUDIT_AUTH_LOGOUT,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ success: true });
  } catch (error) { next(error); }
});

authRouter.get('/me', isAuthenticated, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const jwtUser = (req as Request & { user?: { id: number } }).user;
  if (!jwtUser?.id) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  try {
    const profile = await getProfileUseCase.execute(jwtUser.id);
    if (!profile) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      return;
    }

    res.status(200).json({
      user: {
        id: profile.id,
        email: profile.email,
        firstname: profile.firstname ?? null,
        lastname: profile.lastname ?? null,
        role: profile.role,
      },
    });
  } catch (error) { next(error); }
});

authRouter.post('/social-login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { provider, idToken } = (req.body || {}) as {
      provider?: string;
      idToken?: string;
    };

    if (!provider || !idToken) {
      throw badRequest('provider and idToken are required');
    }

    if (provider !== 'apple' && provider !== 'google') {
      throw badRequest('provider must be "apple" or "google"');
    }

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
  } catch (error) { next(error); }
});

authRouter.delete('/account', isAuthenticated, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const user = (
    req as Request & {
      user?: { id?: number };
    }
  ).user;

  if (!user?.id) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  try {
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
  } catch (error) { next(error); }
});

authRouter.get('/export-data', isAuthenticated, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const jwtUser = (req as Request & { user?: { id: number } }).user;

  if (!jwtUser?.id) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  try {
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
  } catch (error) { next(error); }
});

authRouter.put('/change-password', isAuthenticated, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const jwtUser = (req as Request & { user?: { id: number } }).user;
  if (!jwtUser?.id) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw badRequest('currentPassword and newPassword are required');
    }
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
  } catch (error) { next(error); }
});

const passwordResetLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 300_000,
  keyGenerator: byIp,
});

authRouter.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const token = await forgotPasswordUseCase.execute(email);
    auditService.log({
      action: AUDIT_AUTH_PASSWORD_RESET_REQUEST,
      actorType: 'anonymous',
      metadata: { email },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({
      message: 'If this email exists, a reset link has been sent.',
      ...(env.nodeEnv === 'development' ? { debugResetToken: token } : {}),
    });
  } catch (error) { next(error); }
});

authRouter.post('/reset-password', passwordResetLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    await resetPasswordUseCase.execute(token, newPassword);
    auditService.log({
      action: AUDIT_AUTH_PASSWORD_RESET,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ message: 'Password updated successfully.' });
  } catch (error) { next(error); }
});

authRouter.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body || {};
    const result = await verifyEmailUseCase.execute(token);
    auditService.log({
      action: AUDIT_AUTH_EMAIL_VERIFIED,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  } catch (error) { next(error); }
});

// ─── API Key Management (B2B) ─── gated behind feature flag ───
const apiKeyLimiter = createRateLimitMiddleware({
  limit: 10,
  windowMs: 60_000,
  keyGenerator: byUserId,
});

if (env.featureFlags.apiKeys) {
  authRouter.post('/api-keys', isAuthenticatedJwtOnly, apiKeyLimiter, async (req: Request, res: Response, next: NextFunction) => {
    const jwtUser = (req as Request & { user?: { id: number } }).user;
    if (!jwtUser?.id) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    try {
      const { name, expiresAt } = req.body || {};
      if (!name || typeof name !== 'string') {
        throw badRequest('name is required');
      }
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
    } catch (error) { next(error); }
  });

  authRouter.get('/api-keys', isAuthenticatedJwtOnly, async (req: Request, res: Response, next: NextFunction) => {
    const jwtUser = (req as Request & { user?: { id: number } }).user;
    if (!jwtUser?.id) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    try {
      const result = await listApiKeysUseCase.execute(jwtUser.id);
      res.status(200).json(result);
    } catch (error) { next(error); }
  });

  authRouter.delete('/api-keys/:id', isAuthenticatedJwtOnly, async (req: Request, res: Response, next: NextFunction) => {
    const jwtUser = (req as Request & { user?: { id: number } }).user;
    if (!jwtUser?.id) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    try {
      const keyId = parseInt(req.params.id, 10);
      if (isNaN(keyId)) {
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
    } catch (error) { next(error); }
  });
}

export default authRouter;
