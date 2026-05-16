import { notFound } from '@shared/errors/app.error';

import type {
  IUserRepository,
  ProfilePreferencesPatch,
} from '@modules/auth/domain/user/user.repository.interface';

/**
 * TD-2 — Effective state of the 5 profile-preference columns after a patch.
 * Returned to the HTTP layer so the client can echo the canonical post-write
 * shape (including fields that weren't part of the patch but matter for the
 * client cache).
 */
export interface ProfilePreferences {
  defaultLocale: string;
  defaultMuseumMode: boolean;
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  dataMode: 'auto' | 'low' | 'normal';
  audioDescriptionMode: boolean;
}

/**
 * TD-2 — Persists a partial patch of the 5 profile-preference columns and
 * returns the full effective state (patch fields override server fields).
 *
 * Validation contract:
 *  - Field-level value enums (`guideLevel`, `dataMode`) are validated upstream
 *    by the Zod schema attached to the route. The use case trusts the patch
 *    shape post-validation.
 *  - Empty patch (`{}`) is rejected at the route level by the Zod
 *    `.refine(non-empty)` rule; if the use case is invoked with `{}` directly
 *    (unit-test code path), it MUST stay safe — the repo no-ops on empty.
 */
export class UpdateProfilePreferencesUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Validates user existence, persists the patch, and returns the canonical
   * effective preferences.
   *
   * @param userId - Authenticated user id.
   * @param patch - Partial preferences. Only defined keys are written.
   * @throws {AppError} 404 if the user does not exist.
   */
  async execute(userId: number, patch: ProfilePreferencesPatch): Promise<ProfilePreferences> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw notFound('User not found');
    }
    await this.userRepository.updateProfilePreferences(userId, patch);
    return {
      defaultLocale: patch.defaultLocale ?? user.defaultLocale,
      defaultMuseumMode: patch.defaultMuseumMode ?? user.defaultMuseumMode,
      guideLevel: patch.guideLevel ?? user.guideLevel,
      dataMode: patch.dataMode ?? user.dataMode,
      audioDescriptionMode: patch.audioDescriptionMode ?? user.audioDescriptionMode,
    };
  }
}
