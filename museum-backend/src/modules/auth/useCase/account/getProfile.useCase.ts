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
  /**
   * Spec C T2.4 — Visitor's preferred TTS voice (one of `TTS_VOICES` from
   * `@modules/chat/domain/voice-catalog`). `null` means "use the env-level default".
   */
  ttsVoice: string | null;
  /** TD-2 — BCP-47 default locale. NOT NULL, default `en-US`. */
  defaultLocale: string;
  /** TD-2 — Auto-detect museum mode on launch. NOT NULL, default `true`. */
  defaultMuseumMode: boolean;
  /** TD-2 — Self-declared expertise level. NOT NULL, default `beginner`. */
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  /** TD-2 — Data-saver heuristic. NOT NULL, default `auto`. */
  dataMode: 'auto' | 'low' | 'normal';
  /** TD-2 — Audio-description accessibility flag. NOT NULL, default `false`. */
  audioDescriptionMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Fetches the full user profile from the database. Used by /me and /export-data after JWT was stripped of PII. */
export class GetProfileUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /** Fetches the user profile by ID, returning null if not found. */
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
      // Migration ensures NOT NULL DEFAULT '{}', so entity type guarantees this is never null.
      contentPreferences: user.contentPreferences,
      ttsVoice: user.ttsVoice ?? null,
      // TD-2 — 5 NOT NULL DEFAULT columns; entity type guarantees non-null.
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
