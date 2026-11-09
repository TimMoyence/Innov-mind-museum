import { type Request, type Response, Router } from 'express';

import { auditOwnAccount } from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
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
import {
  AUDIT_ACCOUNT_DELETED,
  AUDIT_ACCOUNT_DELETION_REQUESTED,
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
    await auditOwnAccount(req, jwtUser.id, AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED, {
      preferences: result.contentPreferences,
    });
    res.status(200).json({ contentPreferences: result.contentPreferences });
  },
);

authProfileRouter.patch(
  '/tts-voice',
  isAuthenticated,
  validateBody(updateTtsVoiceSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { voice } = req.body;
    const result = await updateTtsVoiceUseCase.execute(jwtUser.id, voice);
    await auditOwnAccount(req, jwtUser.id, AUDIT_AUTH_TTS_VOICE_UPDATED, {
      voice: result.ttsVoice,
    });
    res.status(200).json({ ttsVoice: result.ttsVoice });
  },
);

authProfileRouter.patch(
  '/me/preferences',
  isAuthenticated,
  validateBody(updateProfilePreferencesSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const patch = req.body as ProfilePreferencesPatch;
    const result = await updateProfilePreferencesUseCase.execute(jwtUser.id, patch);
    await auditOwnAccount(req, jwtUser.id, AUDIT_AUTH_PROFILE_PREFERENCES_UPDATED, { patch });
    res.status(200).json(result);
  },
);

authProfileRouter.patch(
  '/onboarding-complete',
  isAuthenticated,
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    await completeOnboarding(jwtUser.id);
    await auditOwnAccount(req, jwtUser.id, AUDIT_AUTH_ONBOARDING_COMPLETED);
    res.status(204).end();
  },
);

authProfileRouter.delete('/account', isAuthenticated, async (req: Request, res: Response) => {
  const user = requireUser(req);
  await auditOwnAccount(req, user.id, AUDIT_ACCOUNT_DELETION_REQUESTED);

  await deleteAccountUseCase.execute(user.id);

  await auditOwnAccount(req, user.id, AUDIT_ACCOUNT_DELETED);
  res.status(200).json({ deleted: true });
});

export default authProfileRouter;
