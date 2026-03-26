import pool from '../../../../data/db';

import type { ApiKey } from '../../core/domain/apiKey.entity';
import type { ApiKeyRepository } from '../../core/domain/apiKey.repository.interface';

/** PostgreSQL (raw SQL) implementation of {@link ApiKeyRepository}. */
export class ApiKeyRepositoryPg implements ApiKeyRepository {
  /** Finds an active API key by its prefix. */
  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    const result = await pool.query(
      `SELECT * FROM "api_keys" WHERE prefix = $1 AND is_active = true`,
      [prefix],
    );
    return result.rows[0] ?? null;
  }

  /** Lists all API keys owned by a user, ordered by creation date descending. */
  async findByUserId(userId: number): Promise<ApiKey[]> {
    const result = await pool.query(
      `SELECT * FROM "api_keys" WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  /** Inserts a new API key row and returns the persisted record. */
  async save(key: ApiKey): Promise<ApiKey> {
    const result = await pool.query(
      `INSERT INTO "api_keys" (prefix, hash, salt, name, user_id, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: isActive may be undefined from external input
      [key.prefix, key.hash, key.salt, key.name, key.userId, key.expiresAt, key.isActive ?? true],
    );
    return result.rows[0];
  }

  /** Soft-deletes an API key by setting is_active to false. */
  async remove(id: number, userId: number): Promise<boolean> {
    const result = await pool.query(
      `UPDATE "api_keys" SET is_active = false WHERE id = $1 AND user_id = $2 AND is_active = true`,
      [id, userId],
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: rowCount may be null for certain pg drivers
    return (result.rowCount ?? 0) > 0;
  }

  /** Stamps the last_used_at timestamp on an API key. */
  async updateLastUsed(id: number): Promise<void> {
    await pool.query(
      `UPDATE "api_keys" SET last_used_at = NOW() WHERE id = $1`,
      [id],
    );
  }
}
