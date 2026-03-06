import { Request, Response, Router } from 'express';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { env } from '@src/config/env';
import {
  authSessionService,
  forgotPasswordUseCase,
  registerUseCase,
  resetPasswordUseCase,
} from '../../../core/useCase';

const authRouter: Router = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, firstname, lastname } = req.body;
  try {
    const user = await registerUseCase.execute(
      email,
      password,
      firstname,
      lastname,
    );
    if (user && 'password' in user) {
      user.password = 'hidden';
    }
    res.status(201).json(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    res.status(400).json({ error: { code: 'REGISTER_FAILED', message } });
  }
});

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = (req.body || {}) as {
      email?: string;
      password?: string;
    };
    const session = await authSessionService.login(email || '', password || '');
    res.status(200).json(session);
    return;
  } catch (error) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? ((error as { statusCode: number }).statusCode)
        : 401;
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? ((error as { code: string }).code)
        : 'LOGIN_FAILED';
    const message = error instanceof Error ? error.message : 'Login failed';
    res.status(status).json({ error: { code, message } });
    return;
  }
});

authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = (req.body || {}) as { refreshToken?: string };
    const session = await authSessionService.refresh(refreshToken || '');
    res.status(200).json(session);
    return;
  } catch (error) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? ((error as { statusCode: number }).statusCode)
        : 401;
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? ((error as { code: string }).code)
        : 'REFRESH_FAILED';
    const message = error instanceof Error ? error.message : 'Refresh failed';
    res.status(status).json({ error: { code, message } });
    return;
  }
});

authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = (req.body || {}) as { refreshToken?: string };
    await authSessionService.logout(refreshToken);
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    res.status(400).json({ error: { code: 'LOGOUT_FAILED', message } });
    return;
  }
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
  return;
});

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    const token = await forgotPasswordUseCase.execute(email);
    res.json({
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.',
      ...(env.nodeEnv !== 'production' ? { debugResetToken: token } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: { code: 'FORGOT_PASSWORD_FAILED', message } });
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  try {
    await resetPasswordUseCase.execute(token, newPassword);
    res.json({ message: 'Mot de passe mis à jour avec succès.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bad request';
    res.status(400).json({ error: { code: 'RESET_PASSWORD_FAILED', message } });
  }
});

export default authRouter;
