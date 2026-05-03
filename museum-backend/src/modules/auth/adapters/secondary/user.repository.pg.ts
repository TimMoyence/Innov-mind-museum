import bcrypt from 'bcrypt';
import { type DataSource, MoreThan, type Repository } from 'typeorm';

import { conflict } from '@shared/errors/app.error';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import { User } from '../../domain/user.entity';

import type { ContentPreference } from '../../domain/content-preference';
import type { IUserRepository } from '../../domain/user.repository.interface';

/** TypeORM implementation of {@link IUserRepository}. */
export class UserRepositoryPg implements IUserRepository {
  private readonly repo: Repository<User>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(User);
  }

  /**
   * Finds a user by email address.
   *
   * @param email - User email.
   * @returns The user or `null` if not found.
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return await this.repo.findOne({ where: { email } });
  }

  /**
   * Finds a user by numeric ID.
   *
   * @param id - User primary key.
   * @returns The user or `null` if not found.
   */
  async getUserById(id: number): Promise<User | null> {
    return await this.repo.findOne({ where: { id } });
  }

  /**
   * Registers a new user with an email/password credential.
   *
   * @param email - User email (must be unique).
   * @param password - Plain-text password (hashed with bcrypt before storage).
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user.
   * @throws {Error} If a user with the given email already exists.
   */
  async registerUser(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
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
    });
    return await this.repo.save(entity);
  }

  /**
   * Sets a password-reset token and its expiry on the user row.
   *
   * @param email - User email.
   * @param token - Reset token value.
   * @param expires - Expiry date for the token.
   * @returns The updated user.
   */
  async setResetToken(email: string, token: string, expires: Date): Promise<User> {
    await this.repo.update({ email }, { reset_token: token, reset_token_expires: expires });
    const user = await this.repo.findOne({ where: { email } });
    if (!user) throw new Error('User not found after update');
    return user;
  }

  /**
   * Finds a user by a non-expired reset token.
   *
   * @param token - Password-reset token.
   * @returns The matching user or `null`.
   */
  async getUserByResetToken(token: string): Promise<User | null> {
    return await this.repo.findOne({
      where: {
        reset_token: token,
        reset_token_expires: MoreThan(new Date()),
      },
    });
  }

  /**
   * Updates a user's password and clears any reset token.
   *
   * @param userId - User primary key.
   * @param newPassword - New plain-text password (hashed before storage).
   * @returns The updated user.
   */
  async updatePassword(userId: number, newPassword: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.repo.update(userId, {
      password: hashedPassword,
      reset_token: undefined,
      reset_token_expires: undefined,
    });
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found after update');
    return user;
  }

  /**
   * Atomically consume a reset token and update the user's password.
   *
   * @param token - The reset token to consume.
   * @param hashedPassword - The new bcrypt-hashed password.
   * @returns The updated user or `null` if the token is invalid/expired.
   */
  async consumeResetTokenAndUpdatePassword(
    token: string,
    hashedPassword: string,
  ): Promise<User | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({
        password: hashedPassword,
        reset_token: undefined,
        reset_token_expires: undefined,
      })
      .where('reset_token = :token AND reset_token_expires > NOW()', { token })
      .returning('*')
      .execute();

    const raw = result.raw as User[] | undefined;
    return raw?.[0] ?? null;
  }

  /**
   * Stores the SHA-256 hash of an email verification token and its expiry on a user record.
   * SEC (H2): only the hash is persisted — the raw token is sent to the user by email.
   */
  async setVerificationToken(userId: number, hashedToken: string, expires: Date): Promise<void> {
    await this.repo.update(userId, {
      verification_token: hashedToken,
      verification_token_expires: expires,
    });
  }

  /**
   * Marks a user's email as verified by consuming the verification token hash.
   * SEC (H2): the caller must SHA-256-hash the raw token received from the user before calling.
   */
  async verifyEmail(hashedToken: string): Promise<User | null> {
    // TypeORM UpdateQueryBuilder.set() SKIPS columns whose value is `undefined`,
    // so writing `verification_token: undefined` would leave the consumed token
    // intact and allow infinite replays. Use raw `() => 'NULL'` expressions to
    // force the SET clause to actually clear both columns. Without this the
    // 200 OK from replaying the same token is impossible to distinguish from
    // the legitimate first verification.
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

  /**
   * Registers a user originating from social login (no password, email_verified = true).
   *
   * @param email - User email.
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user.
   */
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

  /** Stores an email change token, pending email, and expiry on a user record. */
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

  /** Atomically consumes an email change token and updates the user's email. */
  async consumeEmailChangeToken(hashedToken: string): Promise<User | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({
        email: () => '"pending_email"',
        pending_email: undefined,
        email_change_token: undefined,
        email_change_token_expiry: undefined,
      })
      .where('email_change_token = :hashedToken AND email_change_token_expiry > NOW()', {
        hashedToken,
      })
      .returning('*')
      .execute();

    const raw = result.raw as User[] | undefined;
    return raw?.[0] ?? null;
  }

  /** Marks a user's onboarding as completed. */
  async markOnboardingCompleted(userId: number): Promise<void> {
    await this.repo.update(userId, { onboarding_completed: true });
  }

  /** Replaces the user's content preferences with the provided set. */
  async updateContentPreferences(userId: number, preferences: ContentPreference[]): Promise<void> {
    await this.repo.update(userId, { contentPreferences: preferences });
  }

  /** Persists the user's preferred TTS voice or clears it (`null`). */
  async updateTtsVoice(userId: number, voice: string | null): Promise<void> {
    await this.repo.update(userId, { ttsVoice: voice });
  }

  /**
   * Set or clear the MFA enrollment deadline column (R16). Mirrored from the
   * port doc: pass a Date to start/extend the warning window, or `null` to
   * clear once enrollment succeeds.
   */
  async setMfaEnrollmentDeadline(userId: number, deadline: Date | null): Promise<void> {
    await this.repo.update(userId, { mfaEnrollmentDeadline: deadline });
  }

  /**
   * Deletes a user and all related data (sessions, tokens, social accounts) in a transaction.
   *
   * @param userId - User primary key.
   */
  async deleteUser(userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Chat sessions -> FK cascade: messages, artwork_matches, message_reports
      await manager
        .createQueryBuilder()
        .delete()
        .from('chat_sessions')
        .where('"userId" = :userId', { userId })
        .execute();
      // User -> FK cascade: auth_refresh_tokens, social_accounts
      await manager
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('id = :userId', { userId })
        .execute();
    });
  }
}
