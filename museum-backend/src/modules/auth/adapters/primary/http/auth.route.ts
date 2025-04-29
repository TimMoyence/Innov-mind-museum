import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import {
  forgotPasswordUseCase,
  registerUseCase,
  resetPasswordUseCase,
} from '../../../core/useCase';

const authRouter: Router = Router();

/**
 * Route d'enregistrement
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, firstname, lastname } = req.body;
  try {
    const user = await registerUseCase.execute(
      email,
      password,
      firstname,
      lastname,
    );
    // On retire le mot de passe avant de renvoyer l'utilisateur
    if (user && 'password' in user) {
      user.password = 'je suis le mot de passe';
    }
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Route de login utilisant Passport Local Strategy
 */
authRouter.post('/login', (req: Request, res: Response, next) => {
  passport.authenticate(
    'local',
    { session: true },
    (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user)
        return res
          .status(401)
          .json({ message: info?.message || 'Identifiants invalides' });
      // Si vous utilisez les sessions, Passport va créer une session,
      // sinon, pour JWT, vous pouvez générer un token.
      req.logIn(user, { session: true }, (err) => {
        if (err) return next(err);
        // Exemple de génération de token JWT en complément (optionnel)
        const token = jwt.sign(
          { id: user.id, email: user.email },
          process.env.JWT_SECRET || 'default_secret',
          { expiresIn: '1d' },
        );
        return res.json({ token });
      });
    },
  )(req, res, next);
});

/**
 * Route de logout
 * Cette route nécessite que la session soit active.
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  req.logout((err: any) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la déconnexion.' });
    }
    return res.json({ message: 'Déconnexion réussie.' });
  });
});

/**
 * Route pour la demande de réinitialisation du mot de passe
 */
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    const token = await forgotPasswordUseCase.execute(email);
    // En production, envoyer un email contenant le token
    res.json({
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.',
      token,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Route pour la réinitialisation du mot de passe
 */
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  try {
    await resetPasswordUseCase.execute(token, newPassword);
    res.json({ message: 'Mot de passe mis à jour avec succès.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default authRouter;
