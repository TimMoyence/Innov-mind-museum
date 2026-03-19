import { NextFunction, Request, Response, Router } from 'express';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { env } from '@src/config/env';
import { badRequest } from '@shared/errors/app.error';
import {
  authSessionService,
  forgotPasswordUseCase,
  registerUseCase,
  resetPasswordUseCase,
  socialLoginUseCase,
  deleteAccountUseCase,
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
    if (user && 'password' in user) {
      user.password = 'hidden';
    }
    res.status(201).json(user);
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

authRouter.get('/me', isAuthenticated, async (req: Request, res: Response): Promise<void> => {
  const user = (
    req as Request & {
      user?: { id?: number; email?: string; firstname?: string | null; lastname?: string | null };
    }
  ).user as
    | { id?: number; email?: string; firstname?: string | null; lastname?: string | null }
    | undefined;
  if (!user?.id || !user.email) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      firstname: user.firstname || null,
      lastname: user.lastname || null,
    },
  });
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

export default authRouter;
