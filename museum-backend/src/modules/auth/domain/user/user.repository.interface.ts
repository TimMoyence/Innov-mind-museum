import type { User } from './user.entity';
import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';

export interface ProfilePreferencesPatch {
  defaultMuseumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  dataMode?: 'auto' | 'low' | 'normal';
  audioDescriptionMode?: boolean;
}

export interface IUserRepository {
  getUserByEmail(email: string): Promise<User | null>;

  getUserById(id: number): Promise<User | null>;

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

  consumeResetTokenAndUpdatePassword(token: string, hashedPassword: string): Promise<User | null>;

  deleteUser(userId: number): Promise<void>;

  setVerificationToken(userId: number, hashedToken: string, expires: Date): Promise<void>;

  verifyEmail(hashedToken: string): Promise<User | null>;

  setEmailChangeToken(
    userId: number,
    hashedToken: string,
    pendingEmail: string,
    expires: Date,
  ): Promise<void>;

  consumeEmailChangeToken(hashedToken: string): Promise<User | null>;

  markOnboardingCompleted(userId: number): Promise<void>;

  updateContentPreferences(userId: number, preferences: ContentPreference[]): Promise<void>;

  updateTtsVoice(userId: number, voice: string | null): Promise<void>;

  updateProfilePreferences(userId: number, patch: ProfilePreferencesPatch): Promise<void>;
}
