import { type Request, type Response, Router } from 'express';

import {
  changeEmailLimiter,
  emailVerificationLimiter,
} from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import {
  auditOwnAccount,
  pickEmailLocale,
} from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
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
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { env } from '@src/config/env';

const authEmailRouter: Router = Router();

authEmailRouter.put(
  '/change-email',
  isAuthenticated,
  validateBody(changeEmailSchema),
  changeEmailLimiter,
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { newEmail, currentPassword } = req.body;
    const locale = pickEmailLocale(req);
    const token = await changeEmailUseCase.execute(jwtUser.id, newEmail, currentPassword, locale);
    await auditOwnAccount(req, jwtUser.id, AUDIT_AUTH_EMAIL_CHANGE_REQUEST, { newEmail });
    res.status(200).json({
      message: 'A confirmation email has been sent to the new address.',
      ...(env.nodeEnv === 'test' ? { debugToken: token } : {}),
    });
  },
);

authEmailRouter.post(
  '/confirm-email-change',
  validateBody(confirmEmailChangeSchema),
  emailVerificationLimiter,
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
  validateBody(verifyEmailSchema),
  emailVerificationLimiter,
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
