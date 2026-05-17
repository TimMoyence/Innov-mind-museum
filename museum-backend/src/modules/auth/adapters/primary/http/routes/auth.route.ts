import { Router } from 'express';

import authApiKeysRouter from './auth-api-keys.route';
import authEmailRouter from './auth-email.route';
import authGoogleOauthRouter from './auth-google-oauth.route';
import authPasswordRouter from './auth-password.route';
import authProfileRouter from './auth-profile.route';
import authSessionRouter from './auth-session.route';
import superAdminCheckRouter from './super-admin-check.route';

/** Composes sub-routers (session/profile/password/email/api-keys) — see ADR-003. */
const authRouter: Router = Router();

authRouter.use(authSessionRouter);
authRouter.use(authGoogleOauthRouter);
authRouter.use(authProfileRouter);
authRouter.use(authPasswordRouter);
authRouter.use(authEmailRouter);
authRouter.use(authApiKeysRouter);
authRouter.use(superAdminCheckRouter);

export default authRouter;
