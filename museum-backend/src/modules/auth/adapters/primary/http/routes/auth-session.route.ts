import { type NextFunction, type Request, type Response, Router } from 'express';

import {
  clearAuthCookies,
  refreshTokenFromCookie,
  setAuthCookies,
} from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import {
  loginByAccountLimiter,
  loginLimiter,
  logoutLimiter,
  refreshLimiter,
  registerLimiter,
  socialLoginLimiter,
} from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import {
  auditOwnAccount,
  pickEmailLocale,
} from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
import {
  auditLoginError,
  finalizeLoginSuccess,
} from '@modules/auth/adapters/primary/http/helpers/login-handler.helpers';
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  socialLoginSchema,
  socialRedeemSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  authSessionService,
  nonceStore,
  redeemSocialOtcUseCase,
  registerUseCase,
  socialLoginUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_LOGOUT,
  AUDIT_AUTH_REGISTER,
  AUDIT_AUTH_SOCIAL_LOGIN,
} from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';
import { resolveCredential } from '@shared/middleware/authenticated.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

const diagSocialRedeemCode = (req: Request, _res: Response, next: NextFunction): void => {
  const body = req.body as { code?: unknown };
  const code = body.code;
  if (typeof code === 'string' && !/^[A-Za-z0-9_-]+$/.test(code)) {
    logger.warn('social_redeem_diag_invalid_code', {
      firstChars: code.slice(0, 8),
      length: code.length,
      hasHash: code.includes('#'),
      hasEquals: code.includes('='),
      hasPlus: code.includes('+'),
      hasSlash: code.includes('/'),
      hasPercent: code.includes('%'),
      hasSpace: code.includes(' '),
      hasDot: code.includes('.'),
    });
  }
  next();
};

const authSessionRouter: Router = Router();

authSessionRouter.post(
  '/register',
  validateBody(registerSchema),
  registerLimiter,
  async (req: Request, res: Response) => {
    const { email, password, firstname, lastname, dateOfBirth } = req.body;
    const locale = pickEmailLocale(req);
    const user = await registerUseCase.execute({
      email,
      password,
      firstname,
      lastname,
      locale,
      dateOfBirth,
      ip: req.ip,
      requestId: req.requestId,
    });
    await auditOwnAccount(req, user.id, AUDIT_AUTH_REGISTER);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  },
);

authSessionRouter.post(
  '/login',
  validateBody(loginSchema),
  loginLimiter,
  loginByAccountLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await authSessionService.login(email, password);
      await finalizeLoginSuccess(req, res, result);
      res.status(200).json(result);
    } catch (error) {
      await auditLoginError(req, error);
      next(error);
    }
  },
);

authSessionRouter.post(
  '/refresh',
  refreshTokenFromCookie,
  validateBody(refreshSchema),
  refreshLimiter,
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const session = await authSessionService.refresh(refreshToken);
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

authSessionRouter.post(
  '/logout',
  refreshTokenFromCookie,
  validateBody(logoutSchema),
  logoutLimiter,
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    let ctx: { accessJti: string; accessExpSec: number } | undefined;
    try {
      const claims = authSessionService.verifyAccessTokenWithClaims(resolveCredential(req) ?? '');
      ctx = { accessJti: claims.jti, accessExpSec: claims.expSec };
    } catch {}
    await authSessionService.logout(refreshToken, ctx);
    await auditService.log({
      action: AUDIT_AUTH_LOGOUT,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    clearAuthCookies(res);
    res.status(200).json({ success: true });
  },
);

authSessionRouter.post(
  '/social-login',
  validateBody(socialLoginSchema),
  socialLoginLimiter,
  async (req: Request, res: Response) => {
    const { provider, idToken, nonce } = req.body;
    const session = await socialLoginUseCase.execute(provider, idToken, nonce);
    await auditOwnAccount(req, session.user.id, AUDIT_AUTH_SOCIAL_LOGIN, { provider });
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

authSessionRouter.post(
  '/social-nonce',
  socialLoginLimiter,
  async (_req: Request, res: Response) => {
    const issuedNonce = await nonceStore.issue();
    res.status(200).json({ nonce: issuedNonce });
  },
);

authSessionRouter.post(
  '/social-redeem',
  diagSocialRedeemCode,
  validateBody(socialRedeemSchema),
  socialLoginLimiter,
  async (req: Request, res: Response) => {
    const { code } = req.body;
    const session = await redeemSocialOtcUseCase.execute(code);
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

export default authSessionRouter;
