import { type Request, type Response, Router } from 'express';

import {
  changeEmailLimiter,
  emailVerificationLimiter,
} from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import { pickEmailLocale } from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
import {
  changeEmailSchema,
  confirmEmailChangeSchema,
  verifyEmailSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  changeEmailUseCase,
  confirmEmailChangeUseCase,
  verifyEmailUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_EMAIL_CHANGE_CONFIRMED,
  AUDIT_AUTH_EMAIL_CHANGE_REQUEST,
  AUDIT_AUTH_EMAIL_VERIFIED,
} from '@shared/audit/audit.types';
import { requireUser } from '@shared/http/requireUser';
import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

/**
 * Sub-router for email management endpoints:
 * PUT /change-email, POST /confirm-email-change, POST /verify-email.
 */
const authEmailRouter: Router = Router();

authEmailRouter.put(
  '/change-email',
  isAuthenticated,
  changeEmailLimiter,
  validateBody(changeEmailSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { newEmail, currentPassword } = req.body;
    const locale = pickEmailLocale(req);
    const token = await changeEmailUseCase.execute(jwtUser.id, newEmail, currentPassword, locale);
    await auditService.log({
      action: AUDIT_AUTH_EMAIL_CHANGE_REQUEST,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      metadata: { newEmail },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({
      message: 'A confirmation email has been sent to the new address.',
      // SEC-HARDENING (L7): debug token only surfaces in the test environment.
      // Leaking it in dev (which can point at shared staging DBs) would enable
      // account takeover via log inspection.
      ...(env.nodeEnv === 'test' ? { debugToken: token } : {}),
    });
  },
);

authEmailRouter.post(
  '/confirm-email-change',
  emailVerificationLimiter,
  validateBody(confirmEmailChangeSchema),
  async (req: Request, res: Response) => {
    const { token } = req.body;
    const result = await confirmEmailChangeUseCase.execute(token);
    await auditService.log({
      action: AUDIT_AUTH_EMAIL_CHANGE_CONFIRMED,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  },
);

authEmailRouter.post(
  '/verify-email',
  emailVerificationLimiter,
  validateBody(verifyEmailSchema),
  async (req: Request, res: Response) => {
    const { token } = req.body;
    const result = await verifyEmailUseCase.execute(token);
    await auditService.log({
      action: AUDIT_AUTH_EMAIL_VERIFIED,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(result);
  },
);

export default authEmailRouter;
