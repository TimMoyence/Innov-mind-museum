import { type Request, type Response, Router } from 'express';

import { passwordResetLimiter } from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import {
  auditOwnAccount,
  pickEmailLocale,
} from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  changePasswordUseCase,
  forgotPasswordUseCase,
  resetPasswordUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import {
  AUDIT_AUTH_PASSWORD_CHANGE,
  AUDIT_AUTH_PASSWORD_RESET,
  AUDIT_AUTH_PASSWORD_RESET_REQUEST,
} from '@shared/audit/audit.types';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { env } from '@src/config/env';

const authPasswordRouter: Router = Router();

authPasswordRouter.put(
  '/change-password',
  isAuthenticated,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { currentPassword, newPassword } = req.body;
    await changePasswordUseCase.execute(jwtUser.id, currentPassword, newPassword);
    await auditOwnAccount(req, jwtUser.id, AUDIT_AUTH_PASSWORD_CHANGE);
    res.status(200).json({ message: 'Password changed successfully.' });
  },
);

authPasswordRouter.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  passwordResetLimiter,
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const locale = pickEmailLocale(req);
    const token = await forgotPasswordUseCase.execute(email, locale);
    await auditService.log({
      action: AUDIT_AUTH_PASSWORD_RESET_REQUEST,
      actorType: 'anonymous',
      metadata: { emailDomain: extractEmailDomain(email) },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({
      message: 'If this email exists, a reset link has been sent.',
      ...(env.nodeEnv === 'test' ? { debugResetToken: token } : {}),
    });
  },
);

authPasswordRouter.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  passwordResetLimiter,
  async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    await resetPasswordUseCase.execute(token, newPassword);
    await auditService.log({
      action: AUDIT_AUTH_PASSWORD_RESET,
      actorType: 'anonymous',
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ message: 'Password updated successfully.' });
  },
);

export default authPasswordRouter;
