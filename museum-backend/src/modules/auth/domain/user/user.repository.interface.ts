import type { User } from './user.entity';
import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';

/**
 * TD-2 — Partial patch for `PATCH /api/auth/me/preferences`. All fields optional.
 * Repo impl MUST pre-filter `undefined` before `repo.update` (TypeORM silent-skip).
 */
export interface ProfilePreferencesPatch {
  defaultLocale?: string;
  defaultMuseumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  dataMode?: 'auto' | 'low' | 'normal';
  audioDescriptionMode?: boolean;
}

/** Port for user persistence. Implemented by {@link UserRepositoryPg}. */
export interface IUserRepository {
  getUserByEmail(email: string): Promise<User | null>;

  getUserById(id: number): Promise<User | null>;

  /** `dateOfBirth` is ISO `YYYY-MM-DD` persisted to `date_of_birth` for the digital-majority age-gate. */
  registerUser(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
    dateOfBirth?: string,
  ): Promise<User>;

  setResetToken(email: string, token: string, expires: Date): Promise<User>;

  getUserByResetToken(token: string): Promise<User | null>;

  updatePassword(userId: number, newPassword: string): Promise<User>;

  registerSocialUser(email: string, firstname?: string, lastname?: string): Promise<User>;

  /** Atomic — prevents race when two requests use the same token. */
  consumeResetTokenAndUpdatePassword(token: string, hashedPassword: string): Promise<User | null>;

  /** Permanently delete a user and all associated data (GDPR). */
  deleteUser(userId: number): Promise<void>;

  /** SEC (H2): only the hash is persisted — raw token sent to user by email. */
  setVerificationToken(userId: number, hashedToken: string, expires: Date): Promise<void>;

  /** Atomic. SEC (H2): callers MUST SHA-256-hash the raw token before calling. */
  verifyEmail(hashedToken: string): Promise<User | null>;

  setEmailChangeToken(
    userId: number,
    hashedToken: string,
    pendingEmail: string,
    expires: Date,
  ): Promise<void>;

  /** Atomic. Clears pending_email, email_change_token, email_change_token_expiry. */
  consumeEmailChangeToken(hashedToken: string): Promise<User | null>;

  markOnboardingCompleted(userId: number): Promise<void>;

  /** Empty array clears all preferences. */
  updateContentPreferences(userId: number, preferences: ContentPreference[]): Promise<void>;

  /** `null` clears the voice (reset to env default). Caller validates against catalog. */
  updateTtsVoice(userId: number, voice: string | null): Promise<void>;

  /**
   * TD-2 — Partial write of profile-preference columns. Impl MUST pre-filter
   * `undefined` to sidestep the `repo.update(_, { field: undefined })` silent-skip gotcha.
   */
  updateProfilePreferences(userId: number, patch: ProfilePreferencesPatch): Promise<void>;

  /** `null` clears the MFA enrollment deadline; pass `now + 30d` on first admin login post-deploy. */
  setMfaEnrollmentDeadline(userId: number, deadline: Date | null): Promise<void>;
}
