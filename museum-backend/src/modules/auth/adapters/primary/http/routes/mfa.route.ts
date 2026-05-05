import { type Request, type Response, Router } from 'express';
import { z } from 'zod';

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
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import {
  byIp,
  byUserId,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

/**
 * R16 MFA endpoints (SOC2 CC6.1).
 *
 * Rate limits keyed by **user id where known** (so an admin behind CGNAT
 * cannot lock everyone out of the same office). For unauthenticated routes
 * (`/challenge` and `/recovery`) the user id is recovered from the
 * `mfaSessionToken` in the body — when absent / invalid, fall back to IP so
 * we still bound brute-force attempts.
 */
const mfaRouter: Router = Router();

const RATE_LIMIT_OPTIONS = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

/**
 * Resolve a rate-limit key from a body-bearing request:
 *   - First try `req.user.id` (authenticated routes).
 *   - Then try the body's `mfaSessionToken` (challenge / recovery).
 *   - Fall back to IP. Always prefixed so the buckets do not collide with
 *     the route-specific `bucketName`.
 */
function bySessionOrIp(req: Request): string {
  const user = (req as Request & { user?: { id?: number } }).user;
  if (user?.id) return `user:${String(user.id)}`;
  const token = (req.body as { mfaSessionToken?: unknown }).mfaSessionToken;
  if (typeof token === 'string' && token.length > 0) {
    try {
      const decoded = verifyMfaSessionToken(token);
      return `mfa-session:${String(decoded.userId)}`;
    } catch {
      // fall through to IP
    }
  }
  return `ip:${byIp(req)}`;
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
 * F9 — admin envelope GET /auth/mfa/status. Self-scoped read of the calling
 * user's MFA enrollment state. Drives the "Enable / Disable MFA" toggle on
 * the mobile + admin clients without exposing the encrypted secret.
 *
 * RBAC: authenticated user only — `req.user.id` IS the user being read. No
 * admin-impersonation path; admin-on-other-user goes through the audit log.
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
  // The plain `recoveryCodes` array is intentionally returned ONCE here.
  // The frontend MUST surface them for the user to copy/save before they
  // navigate away — server cannot recover them later (they are bcrypt-hashed
  // at rest).
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
  challengeLimiter,
  validateBody(challengeSchema),
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
      res.status(200).json(session);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_MFA_CODE') {
        // Best-effort attribution for the failure audit row.
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
  recoveryLimiter,
  validateBody(recoverySchema),
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
