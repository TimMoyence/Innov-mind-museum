import { notFound } from '@shared/errors/app.error';

import type {
  IUserRepository,
  ProfilePreferencesPatch,
} from '@modules/auth/domain/user/user.repository.interface';

/** TD-2 — effective state after patch (includes unchanged fields for client cache). */
export interface ProfilePreferences {
  defaultLocale: string;
  defaultMuseumMode: boolean;
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  dataMode: 'auto' | 'low' | 'normal';
  audioDescriptionMode: boolean;
}

/**
 * TD-2 — Validation contract:
 *  - Value enums (`guideLevel`, `dataMode`) validated upstream by Zod schema;
 *    use case trusts post-validation shape.
 *  - Empty patch `{}` rejected at route by `.refine(non-empty)`; if invoked
 *    directly (unit-test path), MUST stay safe — repo no-ops on empty.
 */
export class UpdateProfilePreferencesUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /** @throws {AppError} 404 if user does not exist. */
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
