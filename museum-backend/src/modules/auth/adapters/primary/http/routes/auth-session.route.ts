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

/**
 * TEMP DIAG (2026-05-12) — TestFlight 1.2.2/88: /social-redeem 400 with no
 * insight. Emits PII-safe fingerprint (first 8 chars + length + char-class
 * booleans) before validateBody to pinpoint cause if FE parseCallbackUrl
 * fragment-strip fix doesn't resolve. OTC single-use 60s — leakage risk
 * acceptable for diag window. REVERT once TestFlight reports clean.
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
  // per lib-docs/zod/PATTERNS.md §3 L202-206 (safeParse short-circuit before counter mutation)
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
  // per lib-docs/zod/PATTERNS.md §3 L202-206 (safeParse short-circuit before counter mutation)
  refreshLimiter,
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const session = await authSessionService.refresh(refreshToken);
    // F7 — refresh cookies in lockstep with rotated tokens. JSON envelope unchanged.
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
    // R7 — the access token (Bearer or access_token cookie, best-effort) feeds
    // the access-token denylist. Absent / invalid / expired → undefined ctx →
    // logout still idempotent, no leak of token validation details.
    let ctx: { accessJti: string; accessExpSec: number } | undefined;
    try {
      const claims = authSessionService.verifyAccessTokenWithClaims(resolveCredential(req) ?? '');
      ctx = { accessJti: claims.jti, accessExpSec: claims.expSec };
    } catch {
      // Access token absent/invalid/expired — silent, no leak.
    }
    await authSessionService.logout(refreshToken, ctx);
    await auditService.log({
      action: AUDIT_AUTH_LOGOUT,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    // F7 — no-op on mobile.
    clearAuthCookies(res);
    res.status(200).json({ success: true });
  },
);

authSessionRouter.post(
  '/social-login',
  validateBody(socialLoginSchema),
  // per lib-docs/zod/PATTERNS.md §3 L202-206 (safeParse short-circuit before counter mutation)
  socialLoginLimiter,
  async (req: Request, res: Response) => {
    const { provider, idToken, nonce } = req.body;
    const session = await socialLoginUseCase.execute(provider, idToken, nonce);
    await auditOwnAccount(req, session.user.id, AUDIT_AUTH_SOCIAL_LOGIN, { provider });
    // F7 — dual-mode (same as /login).
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

// F3 — issue server-bound nonce for next /social-login. Rate-limited so
// attacker cannot burn entropy pool / hammer Redis. No body required.
authSessionRouter.post(
  '/social-nonce',
  socialLoginLimiter,
  async (_req: Request, res: Response) => {
    const issuedNonce = await nonceStore.issue();
    res.status(200).json({ nonce: issuedNonce });
  },
);

// F11-mobile — OTC handoff. Auth audit row already emitted in /google/callback;
// only needs rate-limit guard against OTC entropy-pool bruteforce.
authSessionRouter.post(
  '/social-redeem',
  diagSocialRedeemCode,
  validateBody(socialRedeemSchema),
  // per lib-docs/zod/PATTERNS.md §3 L202-206 (safeParse short-circuit before counter mutation)
  socialLoginLimiter,
  async (req: Request, res: Response) => {
    const { code } = req.body;
    const session = await redeemSocialOtcUseCase.execute(code);
    setAuthCookies(res, session);
    res.status(200).json(session);
  },
);

export default authSessionRouter;
