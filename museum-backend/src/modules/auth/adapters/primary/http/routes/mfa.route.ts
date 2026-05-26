import { type Request, type Response, Router } from 'express';
import { z } from 'zod';

import { setAuthCookies } from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import {
  challengeMfaUseCase,
  disableMfaUseCase,
  enrollMfaUseCase,
  getMfaStatusUseCase,
  recoveryMfaUseCase,
  verifyMfaUseCase,
} from '@modules/auth/useCase';
import { verifyMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { auditService } from '@shared/audit';
import {
  AUDIT_MFA_CHALLENGE_FAILED,
  AUDIT_MFA_CHALLENGE_SUCCESS,
  AUDIT_MFA_DISABLED,
  AUDIT_MFA_ENROLL_STARTED,
  AUDIT_MFA_ENROLL_VERIFIED,
  AUDIT_MFA_RECOVERY_USED,
} from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import {
  byIp,
  byUserId,
  createRateLimitMiddleware,
} from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

/**
 * R16 MFA (SOC2 CC6.1). Rate-limit keyed by user id where known (admin behind
 * CGNAT can't lock everyone in the office). For `/challenge` + `/recovery`,
 * userId recovered from body `mfaSessionToken`; falls back to IP if absent/invalid.
 */
const mfaRouter: Router = Router();

const RATE_LIMIT_OPTIONS = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

/** Prefixes produced by {@link bySessionOrIp}. */
export const MFA_RATE_LIMIT_BUCKET_PREFIX = {
  USER: 'user:',
  MFA_SESSION: 'mfa-session:',
  IP: 'ip:',
} as const;

/**
 * Order: req.user.id → body.mfaSessionToken → IP. Always prefixed to avoid
 * cross-bucket collision. Exported for direct unit tests — the rate-limit
 * factory is mocked at route unit-test layer, so Stryker perTest can't map
 * mutants inside this helper otherwise.
 */
export function bySessionOrIp(req: Request): string {
  const user = req.user;
  if (user?.id) return `${MFA_RATE_LIMIT_BUCKET_PREFIX.USER}${String(user.id)}`;
  const token = (req.body as { mfaSessionToken?: unknown }).mfaSessionToken;
  if (typeof token === 'string' && token.length > 0) {
    try {
      const decoded = verifyMfaSessionToken(token);
      return `${MFA_RATE_LIMIT_BUCKET_PREFIX.MFA_SESSION}${String(decoded.userId)}`;
    } catch {
      // fall through to IP
    }
  }
  return `${MFA_RATE_LIMIT_BUCKET_PREFIX.IP}${byIp(req)}`;
}

const enrollLimiter = createRateLimitMiddleware({
  ...RATE_LIMIT_OPTIONS,
  bucketName: 'mfa-enroll',
  keyGenerator: byUserId,
});
const verifyLimiter = createRateLimitMiddleware({
  ...RATE_LIMIT_OPTIONS,
  bucketName: 'mfa-verify',
  keyGenerator: byUserId,
});
const challengeLimiter = createRateLimitMiddleware({
  ...RATE_LIMIT_OPTIONS,
  bucketName: 'mfa-challenge',
  keyGenerator: bySessionOrIp,
});
const recoveryLimiter = createRateLimitMiddleware({
  ...RATE_LIMIT_OPTIONS,
  bucketName: 'mfa-recovery',
  keyGenerator: bySessionOrIp,
});
const disableLimiter = createRateLimitMiddleware({
  ...RATE_LIMIT_OPTIONS,
  bucketName: 'mfa-disable',
  keyGenerator: byUserId,
});

const verifyEnrollSchema = z.object({ code: z.string().min(6).max(6) });
const challengeSchema = z.object({
  mfaSessionToken: z.string().min(1),
  code: z.string().min(6).max(6),
});
const recoverySchema = z.object({
  mfaSessionToken: z.string().min(1),
  recoveryCode: z.string().min(6).max(32),
});
const disableSchema = z.object({ currentPassword: z.string().min(1) });

/**
 * F9 — self-scoped read. `req.user.id` IS the user being read; no admin
 * impersonation (admin-on-other-user goes through audit log).
 */
mfaRouter.get('/status', isAuthenticated, async (req: Request, res: Response) => {
  const user = requireUser(req);
  const envelope = await getMfaStatusUseCase.execute(user.id);
  res.status(200).json(envelope);
});

mfaRouter.post('/enroll', isAuthenticated, enrollLimiter, async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await enrollMfaUseCase.execute(user.id);
  await auditService.log({
    action: AUDIT_MFA_ENROLL_STARTED,
    actorType: 'user',
    actorId: user.id,
    targetType: 'user',
    targetId: String(user.id),
    ip: req.ip,
    requestId: req.requestId,
  });
  // Plain `recoveryCodes` returned ONCE — FE MUST surface for save; server
  // cannot recover (bcrypt-hashed at rest).
  res.status(200).json(result);
});

mfaRouter.post(
  '/enroll/verify',
  isAuthenticated,
  verifyLimiter,
  validateBody(verifyEnrollSchema),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { code } = req.body as { code: string };
    const result = await verifyMfaUseCase.execute(user.id, code);
    await auditService.log({
      action: AUDIT_MFA_ENROLL_VERIFIED,
      actorType: 'user',
      actorId: user.id,
      targetType: 'user',
      targetId: String(user.id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ enrolledAt: result.enrolledAt });
  },
);

mfaRouter.post(
  '/challenge',
  validateBody(challengeSchema),
  // per lib-docs/zod/PATTERNS.md §3 L202-206 (safeParse short-circuit before counter mutation)
  challengeLimiter,
  async (req: Request, res: Response) => {
    const { mfaSessionToken, code } = req.body as { mfaSessionToken: string; code: string };
    try {
      const { session, userId } = await challengeMfaUseCase.execute({ mfaSessionToken, code });
      await auditService.log({
        action: AUDIT_MFA_CHALLENGE_SUCCESS,
        actorType: 'user',
        actorId: userId,
        targetType: 'user',
        targetId: String(userId),
        ip: req.ip,
        requestId: req.requestId,
      });
      // F7 dual-mode: mirror the session to HttpOnly auth cookies so the web
      // admin client (which authenticates exclusively via cookies) is logged in
      // after a successful challenge. Mobile still reads the body tokens.
      setAuthCookies(res, session);
      res.status(200).json(session);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_MFA_CODE') {
        // Best-effort attribution.
        try {
          const decoded = verifyMfaSessionToken(mfaSessionToken);
          await auditService.log({
            action: AUDIT_MFA_CHALLENGE_FAILED,
            actorType: 'user',
            actorId: decoded.userId,
            targetType: 'user',
            targetId: String(decoded.userId),
            ip: req.ip,
            requestId: req.requestId,
          });
        } catch {
          await auditService.log({
            action: AUDIT_MFA_CHALLENGE_FAILED,
            actorType: 'anonymous',
            ip: req.ip,
            requestId: req.requestId,
          });
        }
      }
      throw error;
    }
  },
);

mfaRouter.post(
  '/recovery',
  validateBody(recoverySchema),
  // per lib-docs/zod/PATTERNS.md §3 L202-206 (safeParse short-circuit before counter mutation)
  recoveryLimiter,
  async (req: Request, res: Response) => {
    const { mfaSessionToken, recoveryCode } = req.body as {
      mfaSessionToken: string;
      recoveryCode: string;
    };
    const { session, userId, remainingCodes } = await recoveryMfaUseCase.execute({
      mfaSessionToken,
      recoveryCode,
    });
    await auditService.log({
      action: AUDIT_MFA_RECOVERY_USED,
      actorType: 'user',
      actorId: userId,
      targetType: 'user',
      targetId: String(userId),
      metadata: { remainingCodes },
      ip: req.ip,
      requestId: req.requestId,
    });
    // F7 dual-mode: same as /challenge — mirror the session to HttpOnly auth
    // cookies for the web client; mobile keeps the body tokens.
    setAuthCookies(res, session);
    res.status(200).json({ ...session, remainingRecoveryCodes: remainingCodes });
  },
);

mfaRouter.post(
  '/disable',
  isAuthenticated,
  disableLimiter,
  validateBody(disableSchema),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { currentPassword } = req.body as { currentPassword: string };
    await disableMfaUseCase.execute(user.id, currentPassword);
    await auditService.log({
      action: AUDIT_MFA_DISABLED,
      actorType: 'user',
      actorId: user.id,
      targetType: 'user',
      targetId: String(user.id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ disabled: true });
  },
);

export default mfaRouter;
