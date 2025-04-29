import bcrypt from 'bcrypt';
import pool from '../../../../data/db';
import { User } from '../../core/domain/user.entity';
import { IUserRepository } from '../../core/domain/user.repository.interface';

export class UserRepositoryPg implements IUserRepository {
  async getUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM "users" WHERE email = $1';
    const values = [email];
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async getUserById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM "users" WHERE id = $1';
    const values = [id];
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

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

  async getUserByResetToken(token: string): Promise<User | null> {
    const query = `
      SELECT *
      FROM "users"
      WHERE reset_token = $1 AND reset_token_expires > NOW()
    `;
    const result = await pool.query(query, [token]);
    return result.rows[0] || null;
  }

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
}
