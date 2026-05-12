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
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

/**
 * TEMP DIAGNOSTIC (2026-05-12) — TestFlight 1.2.2/88 prod log 13:52:49.094
 * shows /social-redeem 400 `Code must be base64url` with no insight into the
 * actual payload. This middleware fires BEFORE validateBody and emits a
 * PII-safe fingerprint (first 8 chars + length + char-class booleans) of any
 * code that fails the backend's base64url regex, so we can pinpoint the
 * cause if the FE parser fix (parseCallbackUrl fragment strip) does not
 * fully resolve TestFlight failures. OTC is single-use 60s — short-lived
 * leakage risk is acceptable for the diagnostic window. REVERT this block
 * once TestFlight reports clean.
 */
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
    const { email, password, firstname, lastname, dateOfBirth } = req.body;
    const locale = pickEmailLocale(req);
    const user = await registerUseCase.execute({
      email,
      password,
      firstname,
      lastname,
      locale,
      dateOfBirth,
    });
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

// F11-mobile — exchange the one-time-code delivered to the mobile client via
// the /google/callback deeplink for the actual session payload. The auth
// audit row is emitted inside /google/callback (where the user actually
// authenticated); /social-redeem is a token handoff and only requires the
// rate-limit guard against bruteforce of the OTC entropy pool.
authSessionRouter.post(
  '/social-redeem',
  socialLoginLimiter,
  diagSocialRedeemCode,
  validateBody(socialRedeemSchema),
  async (req: Request, res: Response) => {
    const { code } = req.body;
    const session = await redeemSocialOtcUseCase.execute(code);
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

export default authSessionRouter;
