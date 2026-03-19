import pool from '../../../../data/db';
import { ApiKey } from '../../core/domain/apiKey.entity';
import type { ApiKeyRepository } from '../../core/domain/apiKey.repository.interface';

/** PostgreSQL (raw SQL) implementation of {@link ApiKeyRepository}. */
export class ApiKeyRepositoryPg implements ApiKeyRepository {
  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    const result = await pool.query(
      `SELECT * FROM "api_keys" WHERE prefix = $1 AND is_active = true`,
      [prefix],
    );
    return result.rows[0] || null;
  }

  async findByUserId(userId: number): Promise<ApiKey[]> {
    const result = await pool.query(
      `SELECT * FROM "api_keys" WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async save(key: ApiKey): Promise<ApiKey> {
    const result = await pool.query(
      `INSERT INTO "api_keys" (prefix, hash, salt, name, user_id, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [key.prefix, key.hash, key.salt, key.name, key.userId, key.expiresAt, key.isActive ?? true],
    );
    return result.rows[0];
  }

  async remove(id: number, userId: number): Promise<boolean> {
    const result = await pool.query(
      `UPDATE "api_keys" SET is_active = false WHERE id = $1 AND user_id = $2 AND is_active = true`,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateLastUsed(id: number): Promise<void> {
    await pool.query(
      `UPDATE "api_keys" SET last_used_at = NOW() WHERE id = $1`,
      [id],
    );
  }
}
