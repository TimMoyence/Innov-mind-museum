import { Router } from 'express';

import authApiKeysRouter from './auth-api-keys.route';
import authEmailRouter from './auth-email.route';
import authPasswordRouter from './auth-password.route';
import authProfileRouter from './auth-profile.route';
import authSessionRouter from './auth-session.route';

/**
 * Express router for authentication endpoints. Composes 5 sub-routers
 * (session lifecycle, profile, password, email, API keys) so each
 * concern lives in its own file under ./auth-*.router.ts. The full URL
 * surface mounted at /api/auth is preserved verbatim — see ADR-003 for
 * the split rationale.
 */
const authRouter: Router = Router();

authRouter.use(authSessionRouter);
authRouter.use(authProfileRouter);
authRouter.use(authPasswordRouter);
authRouter.use(authEmailRouter);
authRouter.use(authApiKeysRouter);

export default authRouter;
