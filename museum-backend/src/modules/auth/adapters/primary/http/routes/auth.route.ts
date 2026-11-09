import { Router } from 'express';

import authEmailRouter from './auth-email.route';
import authGoogleOauthRouter from './auth-google-oauth.route';
import authPasswordRouter from './auth-password.route';
import authProfileRouter from './auth-profile.route';
import authSessionRouter from './auth-session.route';

const authRouter: Router = Router();

authRouter.use(authSessionRouter);
authRouter.use(authGoogleOauthRouter);
authRouter.use(authProfileRouter);
authRouter.use(authPasswordRouter);
authRouter.use(authEmailRouter);

export default authRouter;
