import { type Request, type Response, Router } from 'express';

import {
  updateContentPreferencesSchema,
  updateProfilePreferencesSchema,
  updateTtsVoiceSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  completeOnboarding,
  deleteAccountUseCase,
  getProfileUseCase,
  updateContentPreferencesUseCase,
  updateProfilePreferencesUseCase,
  updateTtsVoiceUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import {
  AUDIT_ACCOUNT_DELETED,
  AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED,
  AUDIT_AUTH_ONBOARDING_COMPLETED,
  AUDIT_AUTH_PROFILE_PREFERENCES_UPDATED,
  AUDIT_AUTH_TTS_VOICE_UPDATED,
} from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { ProfilePreferencesPatch } from '@modules/auth/domain/user/user.repository.interface';

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
      // TD-2 — hydrated to FE Zustand stores via `bootstrapProfile()` on login + resume.
      defaultLocale: profile.defaultLocale,
      defaultMuseumMode: profile.defaultMuseumMode,
      guideLevel: profile.guideLevel,
      dataMode: profile.dataMode,
      audioDescriptionMode: profile.audioDescriptionMode,
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

// Spec C T2.4 — schema + catalog validation in updateTtsVoiceSchema. `null` resets to env default.
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

// TD-2 — Batch update of 5 prefs. FE writes field-by-field on toggle; BE
// accepts partial so store actions each fire one PATCH without coordinating.
// Zod `.refine(non-empty)` blocks empty bodies. Audit metadata carries raw patch (no PII).
authProfileRouter.patch(
  '/me/preferences',
  isAuthenticated,
  validateBody(updateProfilePreferencesSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const patch = req.body as ProfilePreferencesPatch;
    const result = await updateProfilePreferencesUseCase.execute(jwtUser.id, patch);
    await auditService.log({
      action: AUDIT_AUTH_PROFILE_PREFERENCES_UPDATED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'user',
      targetId: String(jwtUser.id),
      metadata: { patch },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json(result);
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
