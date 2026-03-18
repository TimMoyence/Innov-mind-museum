import bcrypt from 'bcrypt';
import pool from '../../../../data/db';
import { User } from '../../core/domain/user.entity';
import { IUserRepository } from '../../core/domain/user.repository.interface';

/** PostgreSQL (raw SQL) implementation of {@link IUserRepository}. */
export class UserRepositoryPg implements IUserRepository {
  /**
   * Finds a user by email address.
   * @param email - User email.
   * @returns The user row or `null` if not found.
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM "users" WHERE email = $1';
    const values = [email];
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Finds a user by numeric ID.
   * @param id - User primary key.
   * @returns The user row or `null` if not found.
   */
  async getUserById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM "users" WHERE id = $1';
    const values = [id];
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Registers a new user with an email/password credential.
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
      throw new Error('Un utilisateur avec cet email existe déjà.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `
      INSERT INTO "users" (email, password, firstname, lastname)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [email, hashedPassword, firstname || null, lastname || null];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Sets a password-reset token and its expiry on the user row.
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
    return result.rows[0] || null;
  }

  /**
   * Updates a user's password and clears any reset token.
   * @param userId - User primary key.
   * @param newPassword - New plain-text password (hashed before storage).
   * @returns The updated user row.
   */
  async updatePassword(userId: number, newPassword: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
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
   * Registers a user originating from social login (no password).
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
      INSERT INTO "users" (email, password, firstname, lastname)
      VALUES ($1, NULL, $2, $3)
      RETURNING *
    `;
    const values = [email, firstname || null, lastname || null];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Deletes a user and all related data (sessions, tokens, social accounts) in a transaction.
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
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
