import { type NextFunction, type Request, type Response, Router } from 'express';

import {
  clearAuthCookies,
  setAuthCookies,
} from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import {
  loginByAccountLimiter,
  loginLimiter,
  refreshLimiter,
  registerLimiter,
  socialLoginLimiter,
} from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import { pickEmailLocale } from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
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
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  authSessionService,
  nonceStore,
  registerUseCase,
  socialLoginUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_LOGOUT,
  AUDIT_AUTH_REGISTER,
  AUDIT_AUTH_SOCIAL_LOGIN,
} from '@shared/audit/audit.types';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

/**
 * Sub-router for session lifecycle endpoints:
 * register, login, refresh, logout, social-login, social-nonce.
 */
const authSessionRouter: Router = Router();

authSessionRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    const { email, password, firstname, lastname } = req.body;
    const locale = pickEmailLocale(req);
    const user = await registerUseCase.execute(email, password, firstname, lastname, locale);
    await auditService.log({
      action: AUDIT_AUTH_REGISTER,
      actorType: 'user',
      actorId: user.id,
      targetType: 'user',
      targetId: String(user.id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ user: { id: user.id, email: user.email } });
  },
);

authSessionRouter.post(
  '/login',
  loginLimiter,
  loginByAccountLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await authSessionService.login(email, password);

      // R16 — handle the three login envelope shapes.
      if ('mfaRequired' in result) {
        // Enrolled admin must complete the second factor; nothing privileged
        // happened yet, so emit no LOGIN_SUCCESS audit row.
        res.status(200).json(result);
        return;
      }
      if ('mfaEnrollmentRequired' in result) {
        // Past warning deadline: deny session issuance with a 403 carrying
        // the redirect hint. 403 is intentional — login *failed* in the
        // sense that no JWTs were issued, even though the password was
        // correct.
        res.status(403).json(result);
        return;
      }

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
  refreshLimiter,
  validateBody(refreshSchema),
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const session = await authSessionService.refresh(refreshToken);
    // F7 — refresh the cookies in lockstep with the rotated tokens. JSON
    // envelope kept verbatim for mobile.
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

authSessionRouter.post(
  '/logout',
  validateBody(logoutSchema),
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    await authSessionService.logout(refreshToken);
    await auditService.log({
      action: AUDIT_AUTH_LOGOUT,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    // F7 — clear all three cookies regardless of how the client authenticated.
    // No-op on mobile (no cookies to clear).
    clearAuthCookies(res);
    res.status(200).json({ success: true });
  },
);

authSessionRouter.post(
  '/social-login',
  socialLoginLimiter,
  validateBody(socialLoginSchema),
  async (req: Request, res: Response) => {
    const { provider, idToken, nonce } = req.body;
    const session = await socialLoginUseCase.execute(provider, idToken, nonce);
    await auditService.log({
      action: AUDIT_AUTH_SOCIAL_LOGIN,
      actorType: 'user',
      actorId: session.user.id,
      targetType: 'user',
      targetId: String(session.user.id),
      metadata: { provider },
      ip: req.ip,
      requestId: req.requestId,
    });
    // F7 — same dual-mode emission as /login.
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

// F3 — issue a server-bound nonce for the next /social-login attempt. Rate
// limited (same bucket parameters as /social-login) so an attacker cannot
// burn through the entropy pool or hammer Redis. No body required.
authSessionRouter.post(
  '/social-nonce',
  socialLoginLimiter,
  async (_req: Request, res: Response) => {
    const issuedNonce = await nonceStore.issue();
    res.status(200).json({ nonce: issuedNonce });
  },
);

export default authSessionRouter;
