import { Request, Response, Router, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';

import { env } from '@src/config/env';
import {
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
    res.status(400).json({ error: message });
  }
});

authRouter.post('/login', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'local',
    { session: true },
    (err: unknown, user: { id: number; email: string } | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        return res
          .status(401)
          .json({ message: info?.message || 'Identifiants invalides' });
      }
      req.logIn(user, { session: true }, (logInError) => {
        if (logInError) return next(logInError);
        const token = jwt.sign(
          { id: user.id, email: user.email },
          env.auth.jwtSecret,
          { expiresIn: '1d' },
        );
        return res.json({ token });
      });
    },
  )(req, res, next);
});

authRouter.post('/logout', (req: Request, res: Response) => {
  req.logout((error: unknown) => {
    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la déconnexion.' });
    }
    return res.json({ message: 'Déconnexion réussie.' });
  });
});

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    const token = await forgotPasswordUseCase.execute(email);
    res.json({
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.',
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  try {
    await resetPasswordUseCase.execute(token, newPassword);
    res.json({ message: 'Mot de passe mis à jour avec succès.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bad request';
    res.status(400).json({ error: message });
  }
});

export default authRouter;
