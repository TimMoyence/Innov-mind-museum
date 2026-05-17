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
  /** Spec C T2.4. `null` = use env-level default. */
  ttsVoice: string | null;
  /** TD-2 — BCP-47, NOT NULL default `en-US`. */
  defaultLocale: string;
  /** TD-2 — NOT NULL default `true`. */
  defaultMuseumMode: boolean;
  /** TD-2 — NOT NULL default `beginner`. */
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  /** TD-2 — NOT NULL default `auto`. */
  dataMode: 'auto' | 'low' | 'normal';
  /** TD-2 — NOT NULL default `false`. */
  audioDescriptionMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Used by /me and /export-data after JWT stripped of PII. */
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: role may be undefined in legacy DB rows
      role: user.role || 'visitor',
      onboardingCompleted: user.onboarding_completed,
      contentPreferences: user.contentPreferences,
      ttsVoice: user.ttsVoice ?? null,
      defaultLocale: user.defaultLocale,
      defaultMuseumMode: user.defaultMuseumMode,
      guideLevel: user.guideLevel,
      dataMode: user.dataMode,
      audioDescriptionMode: user.audioDescriptionMode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
