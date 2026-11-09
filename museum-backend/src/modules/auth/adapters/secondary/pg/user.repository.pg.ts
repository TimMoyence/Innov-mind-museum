import bcrypt from 'bcrypt';
import { type DataSource, MoreThan, type Repository } from 'typeorm';

import { User } from '@modules/auth/domain/user/user.entity';
import { conflict } from '@shared/errors/app.error';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';
import type {
  IUserRepository,
  ProfilePreferencesPatch,
} from '@modules/auth/domain/user/user.repository.interface';

export class UserRepositoryPg implements IUserRepository {
  private readonly repo: Repository<User>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(User);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await this.repo.findOne({ where: { email } });
  }

  async getUserById(id: number): Promise<User | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async registerUser(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
    dateOfBirth?: string,
  ): Promise<User> {
    const existingUser = await this.getUserByEmail(email);
    if (existingUser) {
      throw conflict('Un utilisateur avec cet email existe déjà.');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const entity = this.repo.create({
      email,
      password: hashedPassword,
      firstname: firstname ?? undefined,
      lastname: lastname ?? undefined,
      dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00Z`) : null,
    });
    return await this.repo.save(entity);
  }

  async setResetToken(email: string, token: string, expires: Date): Promise<User> {
    await this.repo.update({ email }, { reset_token: token, reset_token_expires: expires });
    const user = await this.repo.findOne({ where: { email } });
    if (!user) throw new Error('User not found after update');
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | null> {
    return await this.repo.findOne({
      where: {
        reset_token: token,
        reset_token_expires: MoreThan(new Date()),
      },
    });
  }

  async updatePassword(userId: number, newPassword: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.repo.update(userId, {
      password: hashedPassword,
      reset_token: () => 'NULL',
      reset_token_expires: () => 'NULL',
    });
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found after update');
    return user;
  }

  async consumeResetTokenAndUpdatePassword(
    token: string,
    hashedPassword: string,
  ): Promise<User | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({
        password: hashedPassword,
        reset_token: () => 'NULL',
        reset_token_expires: () => 'NULL',
      })
      .where('reset_token = :token AND reset_token_expires > NOW()', { token })
      .returning('*')
      .execute();

    const raw = result.raw as User[] | undefined;
    return raw?.[0] ?? null;
  }

  async setVerificationToken(userId: number, hashedToken: string, expires: Date): Promise<void> {
    await this.repo.update(userId, {
      verification_token: hashedToken,
      verification_token_expires: expires,
    });
  }

  async verifyEmail(hashedToken: string): Promise<User | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({
        email_verified: true,
        verification_token: () => 'NULL',
        verification_token_expires: () => 'NULL',
      })
      .where('verification_token = :hashedToken AND verification_token_expires > NOW()', {
        hashedToken,
      })
      .returning('*')
      .execute();

    const raw = result.raw as User[] | undefined;
    return raw?.[0] ?? null;
  }

  async registerSocialUser(email: string, firstname?: string, lastname?: string): Promise<User> {
    const entity = this.repo.create({
      email,
      password: null,
      firstname: firstname ?? undefined,
      lastname: lastname ?? undefined,
      email_verified: true,
    });
    return await this.repo.save(entity);
  }

  async setEmailChangeToken(
    userId: number,
    hashedToken: string,
    pendingEmail: string,
    expires: Date,
  ): Promise<void> {
    await this.repo.update(userId, {
      email_change_token: hashedToken,
      pending_email: pendingEmail,
      email_change_token_expiry: expires,
    });
  }

  async consumeEmailChangeToken(hashedToken: string): Promise<User | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({
        email: () => '"pending_email"',
        pending_email: () => 'NULL',
        email_change_token: () => 'NULL',
        email_change_token_expiry: () => 'NULL',
      })
      .where('email_change_token = :hashedToken AND email_change_token_expiry > NOW()', {
        hashedToken,
      })
      .returning('*')
      .execute();

    const raw = result.raw as User[] | undefined;
    return raw?.[0] ?? null;
  }

  async markOnboardingCompleted(userId: number): Promise<void> {
    await this.repo.update(userId, { onboarding_completed: true });
  }

  async updateContentPreferences(userId: number, preferences: ContentPreference[]): Promise<void> {
    await this.repo.update(userId, { contentPreferences: preferences });
  }

  async updateTtsVoice(userId: number, voice: string | null): Promise<void> {
    await this.repo.update(userId, { ttsVoice: voice });
  }

  async updateProfilePreferences(userId: number, patch: ProfilePreferencesPatch): Promise<void> {
    const update: Partial<User> = {};
    if (patch.defaultMuseumMode !== undefined) update.defaultMuseumMode = patch.defaultMuseumMode;
    if (patch.guideLevel !== undefined) update.guideLevel = patch.guideLevel;
    if (patch.dataMode !== undefined) update.dataMode = patch.dataMode;
    if (patch.audioDescriptionMode !== undefined) {
      update.audioDescriptionMode = patch.audioDescriptionMode;
    }
    if (Object.keys(update).length === 0) return;
    await this.repo.update(userId, update);
  }

  async deleteUser(userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from('chat_sessions')
        .where('"userId" = :userId', { userId })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('id = :userId', { userId })
        .execute();
    });
  }
}
