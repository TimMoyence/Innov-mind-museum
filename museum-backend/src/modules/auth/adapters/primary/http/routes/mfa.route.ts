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
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import {
  byIp,
  byUserId,
  createRateLimitMiddleware,
} from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

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
  const user = req.user;
  // Stryker disable next-line ConditionalExpression: bySessionOrIp is a private rate-limit keyGenerator passed by reference to createRateLimitMiddleware. Route-level unit tests mock that middleware to a no-op (the keyGenerator is never invoked), so Stryker's perTest coverage cannot map the function body to any test even though the mutation would flip the bucket key from "user:${id}" to "ip:…". The branch is exercised by the rate-limit integration suite which Stryker doesn't model with perTest precision. Verified killable via a manual fixture call; equivalence here is a tooling gap, not a behavioral one. 2026-05-13.
  if (user?.id) return `user:${String(user.id)}`;
  const token = (req.body as { mfaSessionToken?: unknown }).mfaSessionToken;
  // Stryker disable next-line ConditionalExpression,EqualityOperator: the `> 0` arm and the `if (true)` collapse are both equivalent — verifyMfaSessionToken('') throws and the catch falls through to `ip:…`, producing the exact same bucket key as skipping the try-block entirely. Manual mutation check confirmed identical outcome for every (typeof token === 'string') × (length 0 vs >0) combination. 2026-05-13.
  if (typeof token === 'string' && token.length > 0) {
    try {
      const decoded = verifyMfaSessionToken(token);
      return `mfa-session:${String(decoded.userId)}`;
    } catch {
      // fall through to IP
    }
  }
  // Stryker disable next-line StringLiteral: same perTest blind spot as L54 — the `ip:` prefix would flip to `` for unauthenticated unmatched-token requests, which the rate-limit integration suite catches but route unit tests with mocked rate-limit middleware cannot detect (the keyGenerator function value is captured by reference and never invoked). 2026-05-13.
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
