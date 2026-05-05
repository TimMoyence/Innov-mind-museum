import { type Request, type Response, Router } from 'express';

import {
  updateContentPreferencesSchema,
  updateTtsVoiceSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  completeOnboarding,
  deleteAccountUseCase,
  getProfileUseCase,
  updateContentPreferencesUseCase,
  updateTtsVoiceUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import {
  AUDIT_ACCOUNT_DELETED,
  AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED,
  AUDIT_AUTH_ONBOARDING_COMPLETED,
  AUDIT_AUTH_TTS_VOICE_UPDATED,
} from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

/**
 * Sub-router for profile + account endpoints:
 * GET /me, PATCH /content-preferences, PATCH /tts-voice,
 * PATCH /onboarding-complete, DELETE /account.
 */
const authProfileRouter: Router = Router();

authProfileRouter.get('/me', isAuthenticated, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const profile = await getProfileUseCase.execute(jwtUser.id);
  if (!profile) {
    throw new AppError({ message: 'User not found', statusCode: 401, code: 'UNAUTHORIZED' });
  }

  res.status(200).json({
    user: {
      id: profile.id,
      email: profile.email,
      firstname: profile.firstname ?? null,
      lastname: profile.lastname ?? null,
      role: profile.role,
      onboardingCompleted: profile.onboardingCompleted,
      contentPreferences: profile.contentPreferences,
      ttsVoice: profile.ttsVoice,
    },
  });
});

authProfileRouter.patch(
  '/content-preferences',
  isAuthenticated,
  validateBody(updateContentPreferencesSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { preferences } = req.body;
    const result = await updateContentPreferencesUseCase.execute(jwtUser.id, preferences);
    await auditService.log({
      action: AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      metadata: { preferences: result.contentPreferences },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ contentPreferences: result.contentPreferences });
  },
);

// Spec C T2.4 — Persist visitor's preferred TTS voice. Schema validation +
// catalog enforcement live in updateTtsVoiceSchema (auth.schemas.ts);
// `null` resets to the env-level default.
authProfileRouter.patch(
  '/tts-voice',
  isAuthenticated,
  validateBody(updateTtsVoiceSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { voice } = req.body;
    const result = await updateTtsVoiceUseCase.execute(jwtUser.id, voice);
    await auditService.log({
      action: AUDIT_AUTH_TTS_VOICE_UPDATED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      metadata: { voice: result.ttsVoice },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ ttsVoice: result.ttsVoice });
  },
);

authProfileRouter.patch(
  '/onboarding-complete',
  isAuthenticated,
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    await completeOnboarding(jwtUser.id);
    await auditService.log({
      action: AUDIT_AUTH_ONBOARDING_COMPLETED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(204).end();
  },
);

authProfileRouter.delete('/account', isAuthenticated, async (req: Request, res: Response) => {
  const user = requireUser(req);
  await auditService.log({
    action: AUDIT_ACCOUNT_DELETED,
    actorType: 'user',
    actorId: user.id,
    targetType: 'user',
    targetId: String(user.id),
    ip: req.ip,
    requestId: req.requestId,
  });
  await deleteAccountUseCase.execute(user.id);
  res.status(200).json({ deleted: true });
});

export default authProfileRouter;
