// import crypto from 'crypto';
// import { NextFunction, Request, Response } from 'express';
// import jwt from 'jsonwebtoken';
// import passport from 'passport';
// import { validateEmail } from '../secondary/email.service';
// import {
//   getUserByEmail,
//   getUserByResetToken,
//   registerUser,
//   setResetToken,
//   updatePassword,
// } from '../secondary/user.repository.pg';

// /**
//  * Contrôleur pour l'enregistrement (register).
//  */
// export async function registerController(req: Request, res: Response) {
//   try {
//     const { email, password, firstname, lastname } = req.body;

//     if (!validateEmail(email)) {
//       return res.status(400).json({ message: "Format d'email invalide." });
//     }

//     const user = await registerUser(email, password, firstname, lastname);

//     const { password: _, ...userWithoutPassword } = user;
//     return res.status(201).json(userWithoutPassword);
//   } catch (error: any) {
//     return res.status(400).json({ message: error.message });
//   }
// }

// /**
//  * Contrôleur pour le login utilisant Passport Local Strategy.
//  */
// export function loginController(
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) {
//   passport.authenticate(
//     'local',
//     { session: false },
//     (err: any, user: any, info: any) => {
//       if (err) return next(err);
//       if (!user) {
//         return res
//           .status(401)
//           .json({ message: info?.message || 'Identifiants invalides.' });
//       }
//       // Génération du token JWT
//       const payload = { id: user.id, email: user.email };
//       const token = jwt.sign(
//         payload,
//         process.env.JWT_SECRET || 'default_secret',
//         { expiresIn: '1d' },
//       );
//       return res.json({ token });
//     },
//   )(req, res, next);
// }

// /**
//  * Contrôleur pour le forgot password.
//  * Génère un token de réinitialisation et l'enregistre en base.
//  * Idéalement, il envoie ensuite un email contenant le token.
//  */
// export async function forgotPasswordController(req: Request, res: Response) {
//   try {
//     const { email } = req.body;
//     if (!validateEmail(email)) {
//       return res.status(400).json({ message: "Format d'email invalide." });
//     }

//     const user = await getUserByEmail(email);
//     if (!user) {
//       // Pour des raisons de sécurité, on ne révèle pas si l'utilisateur existe ou non.
//       return res.status(200).json({
//         message:
//           'Si cet email existe, un lien de réinitialisation a été envoyé.',
//       });
//     }

//     // Générer un token aléatoire
//     const token = crypto.randomBytes(20).toString('hex');
//     // Définir une expiration pour le token (par exemple, 1 heure)
//     const expires = new Date(Date.now() + 3600000);
//     await setResetToken(email, token, expires);

//     // TODO : Envoyer un email avec le token de réinitialisation (via nodemailer par exemple)
//     // Pour l'exemple, on renvoie le token dans la réponse (à ne pas faire en production)
//     return res.json({ message: 'Lien de réinitialisation généré.', token });
//   } catch (error: any) {
//     return res.status(500).json({ message: error.message });
//   }
// }

// /**
//  * Contrôleur pour réinitialiser le mot de passe.
//  */
// export async function resetPasswordController(req: Request, res: Response) {
//   try {
//     const { token, newPassword } = req.body;
//     const user = await getUserByResetToken(token);
//     if (!user) {
//       return res.status(400).json({ message: 'Token invalide ou expiré.' });
//     }
//     await updatePassword(user.id, newPassword);
//     return res.json({ message: 'Mot de passe mis à jour avec succès.' });
//   } catch (error: any) {
//     return res.status(500).json({ message: error.message });
//   }
// }
