import { NextFunction, Request, Response, Router } from 'express';
import { isAuthenticated, isAuthenticatedJwtOnly } from '@src/helpers/middleware/authenticated.middleware';
import { createRateLimitMiddleware, byUserId } from '@src/helpers/middleware/rate-limit.middleware';
import { env } from '@src/config/env';
import { badRequest } from '@shared/errors/app.error';
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

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstname, lastname } = req.body;
    const user = await registerUseCase.execute(email, password, firstname, lastname);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (error) { next(error); }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    const session = await authSessionService.login(email || '', password || '');
    res.status(200).json(session);
  } catch (error) { next(error); }
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
    res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) { next(error); }
});

authRouter.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const token = await forgotPasswordUseCase.execute(email);
    res.json({
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.',
      ...(env.nodeEnv === 'development' ? { debugResetToken: token } : {}),
    });
  } catch (error) { next(error); }
});

authRouter.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    await resetPasswordUseCase.execute(token, newPassword);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) { next(error); }
});

authRouter.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body || {};
    const result = await verifyEmailUseCase.execute(token);
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
      res.status(200).json(result);
    } catch (error) { next(error); }
  });
}

export default authRouter;
