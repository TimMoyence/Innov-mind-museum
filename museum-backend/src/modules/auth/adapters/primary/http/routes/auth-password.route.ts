import { type Request, type Response, Router } from 'express';

import { passwordResetLimiter } from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import { pickEmailLocale } from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
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
import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

/**
 * Sub-router for password endpoints:
 * PUT /change-password, POST /forgot-password, POST /reset-password.
 */
const authPasswordRouter: Router = Router();

authPasswordRouter.put(
  '/change-password',
  isAuthenticated,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { currentPassword, newPassword } = req.body;
    await changePasswordUseCase.execute(jwtUser.id, currentPassword, newPassword);
    await auditService.log({
      action: AUDIT_AUTH_PASSWORD_CHANGE,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ message: 'Password changed successfully.' });
  },
);

authPasswordRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const locale = pickEmailLocale(req);
    const token = await forgotPasswordUseCase.execute(email, locale);
    await auditService.log({
      action: AUDIT_AUTH_PASSWORD_RESET_REQUEST,
      actorType: 'anonymous',
      metadata: { email },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({
      message: 'If this email exists, a reset link has been sent.',
      // SEC-HARDENING (L7): debug token only surfaces in the test environment
      // (see /change-email for rationale).
      ...(env.nodeEnv === 'test' ? { debugResetToken: token } : {}),
    });
  },
);

authPasswordRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
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
