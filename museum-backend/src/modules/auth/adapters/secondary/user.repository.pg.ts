import bcrypt from 'bcrypt';

import { conflict } from '@shared/errors/app.error';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import pool from '../../../../data/db';

import type { User } from '../../core/domain/user.entity';
import type { IUserRepository } from '../../core/domain/user.repository.interface';

/** PostgreSQL (raw SQL) implementation of {@link IUserRepository}. */
export class UserRepositoryPg implements IUserRepository {
  /**
   * Finds a user by email address.
   *
   * @param email - User email.
   * @returns The user row or `null` if not found.
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM "users" WHERE email = $1';
    const values = [email];
    const result = await pool.query(query, values);
    return result.rows[0] ?? null;
  }

  /**
   * Finds a user by numeric ID.
   *
   * @param id - User primary key.
   * @returns The user row or `null` if not found.
   */
  async getUserById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM "users" WHERE id = $1';
    const values = [id];
    const result = await pool.query(query, values);
    return result.rows[0] ?? null;
  }

  /**
   * Registers a new user with an email/password credential.
   *
   * @param email - User email (must be unique).
   * @param password - Plain-text password (hashed with bcrypt before storage).
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user row.
   * @throws Error if a user with the given email already exists.
   */
  async registerUser(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
  ): Promise<User> {
    // Vérifier l'existence préalable
    const existingUser = await this.getUserByEmail(email);
    if (existingUser) {
      throw conflict('Un utilisateur avec cet email existe déjà.');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const query = `
      INSERT INTO "users" (email, password, firstname, lastname)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [email, hashedPassword, firstname ?? null, lastname ?? null];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Sets a password-reset token and its expiry on the user row.
   *
   * @param email - User email.
   * @param token - Reset token value.
   * @param expires - Expiry date for the token.
   * @returns The updated user row.
   */
  async setResetToken(
    email: string,
    token: string,
    expires: Date,
  ): Promise<User> {
    const query = `
      UPDATE "users"
      SET reset_token = $1, reset_token_expires = $2
      WHERE email = $3
      RETURNING *
    `;
    const values = [token, expires, email];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Finds a user by a non-expired reset token.
   *
   * @param token - Password-reset token.
   * @returns The matching user or `null`.
   */
  async getUserByResetToken(token: string): Promise<User | null> {
    const query = `
      SELECT *
      FROM "users"
      WHERE reset_token = $1 AND reset_token_expires > NOW()
    `;
    const result = await pool.query(query, [token]);
    return result.rows[0] ?? null;
  }

  /**
   * Updates a user's password and clears any reset token.
   *
   * @param userId - User primary key.
   * @param newPassword - New plain-text password (hashed before storage).
   * @returns The updated user row.
   */
  async updatePassword(userId: number, newPassword: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const query = `
      UPDATE "users"
      SET password = $1, reset_token = null, reset_token_expires = null
      WHERE id = $2
      RETURNING *
    `;
    const values = [hashedPassword, userId];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Atomically consume a reset token and update the user's password.
   *
   * @param token - The reset token to consume.
   * @param hashedPassword - The new bcrypt-hashed password.
   * @returns The updated user row or `null` if the token is invalid/expired.
   */
  async consumeResetTokenAndUpdatePassword(token: string, hashedPassword: string): Promise<User | null> {
    const query = `
      UPDATE "users"
      SET password = $1, reset_token = NULL, reset_token_expires = NULL
      WHERE reset_token = $2 AND reset_token_expires > NOW()
      RETURNING *
    `;
    const result = await pool.query(query, [hashedPassword, token]);
    return result.rows[0] ?? null;
  }

  /** Stores an email verification token and its expiry on a user record. */
  async setVerificationToken(userId: number, token: string, expires: Date): Promise<void> {
    await pool.query(
      `UPDATE "users" SET verification_token = $1, verification_token_expires = $2 WHERE id = $3`,
      [token, expires, userId],
    );
  }

  /** Marks a user's email as verified by consuming the verification token. */
  async verifyEmail(token: string): Promise<User | null> {
    const query = `
      UPDATE "users"
      SET email_verified = true, verification_token = NULL, verification_token_expires = NULL
      WHERE verification_token = $1 AND verification_token_expires > NOW()
      RETURNING *
    `;
    const result = await pool.query(query, [token]);
    return result.rows[0] ?? null;
  }

  /**
   * Registers a user originating from social login (no password, email_verified = true).
   *
   * @param email - User email.
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user row.
   */
  async registerSocialUser(
    email: string,
    firstname?: string,
    lastname?: string,
  ): Promise<User> {
    const query = `
      INSERT INTO "users" (email, password, firstname, lastname, email_verified)
      VALUES ($1, NULL, $2, $3, true)
      RETURNING *
    `;
    const values = [email, firstname ?? null, lastname ?? null];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Deletes a user and all related data (sessions, tokens, social accounts) in a transaction.
   *
   * @param userId - User primary key.
   */
  async deleteUser(userId: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Chat sessions → FK cascade: messages, artwork_matches, message_reports
      await client.query('DELETE FROM "chat_sessions" WHERE "userId" = $1', [userId]);
      // User → FK cascade: auth_refresh_tokens, social_accounts
      await client.query('DELETE FROM "users" WHERE id = $1', [userId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => { /* best-effort rollback */ });
      throw error;
    } finally {
      void client.release();
    }
  }
}
