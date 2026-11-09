import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';
import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

interface UserProfile {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  role: UserRole;
  onboardingCompleted: boolean;
  contentPreferences: ContentPreference[];
  ttsVoice: string | null;
  defaultMuseumMode: boolean;
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  dataMode: 'auto' | 'low' | 'normal';
  audioDescriptionMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class GetProfileUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: number): Promise<UserProfile | null> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      firstname: user.firstname ?? null,
      lastname: user.lastname ?? null,
      role: user.role,
      onboardingCompleted: user.onboarding_completed,
      contentPreferences: user.contentPreferences,
      ttsVoice: user.ttsVoice ?? null,
      defaultMuseumMode: user.defaultMuseumMode,
      guideLevel: user.guideLevel,
      dataMode: user.dataMode,
      audioDescriptionMode: user.audioDescriptionMode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
