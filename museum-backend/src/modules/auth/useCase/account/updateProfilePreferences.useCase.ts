import { notFound } from '@shared/errors/app.error';

import type {
  IUserRepository,
  ProfilePreferencesPatch,
} from '@modules/auth/domain/user/user.repository.interface';

export interface ProfilePreferences {
  defaultMuseumMode: boolean;
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  dataMode: 'auto' | 'low' | 'normal';
  audioDescriptionMode: boolean;
}

export class UpdateProfilePreferencesUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: number, patch: ProfilePreferencesPatch): Promise<ProfilePreferences> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw notFound('User not found');
    }
    await this.userRepository.updateProfilePreferences(userId, patch);
    return {
      defaultMuseumMode: patch.defaultMuseumMode ?? user.defaultMuseumMode,
      guideLevel: patch.guideLevel ?? user.guideLevel,
      dataMode: patch.dataMode ?? user.dataMode,
      audioDescriptionMode: patch.audioDescriptionMode ?? user.audioDescriptionMode,
    };
  }
}
