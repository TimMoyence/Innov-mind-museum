import pool from '@src/data/db';

import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
  InsertRefreshTokenInput,
} from '../../core/domain/refresh-token.repository.interface';

// Re-export domain types so existing consumers that imported from here keep working
export type {
  StoredRefreshTokenRow,
  InsertRefreshTokenInput,
} from '../../core/domain/refresh-token.repository.interface';

/** Resolve a nullable date field from a raw PG row, handling both camelCase and lowercase column names. */
const toDateOrNull = (row: Record<string, unknown>, camel: string, lower: string): Date | null => {
  const value = row[camel] ?? row[lower];
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return value ? new Date(String(value)) : null;
};

/** Resolve a nullable string field from a raw PG row, handling both camelCase and lowercase column names. */
const toStringOrNull = (
  row: Record<string, unknown>,
  camel: string,
  lower: string,
): string | null => {
  const value = row[camel] ?? row[lower];
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- converting raw DB field to string
  return value ? String(value) : null;
};

const mapRow = (row: Record<string, unknown>): StoredRefreshTokenRow => {
  return {
    id: String(row.id),
    userId: Number(row.userId ?? row.userid),
    jti: String(row.jti),
    familyId: String(row.familyId ?? row.familyid),
    tokenHash: String(row.tokenHash ?? row.tokenhash),
    issuedAt: new Date(String(row.issuedAt ?? row.issuedat)),
    expiresAt: new Date(String(row.expiresAt ?? row.expiresat)),
    rotatedAt: toDateOrNull(row, 'rotatedAt', 'rotatedat'),
    revokedAt: toDateOrNull(row, 'revokedAt', 'revokedat'),
    reuseDetectedAt: toDateOrNull(row, 'reuseDetectedAt', 'reusedetectedat'),
    replacedByTokenId: toStringOrNull(row, 'replacedByTokenId', 'replacedbytokenid'),
    createdAt: new Date(String(row.createdAt ?? row.createdat)),
  };
};

/** PostgreSQL (raw SQL) repository for refresh-token lifecycle management. */
export class RefreshTokenRepositoryPg implements IRefreshTokenRepository {
  /**
   * Inserts a new refresh token row.
   *
   * @param input - Token metadata (userId, jti, familyId, hash, dates).
   * @returns The inserted row.
   */
  async insert(input: InsertRefreshTokenInput): Promise<StoredRefreshTokenRow> {
    const result = await pool.query(
      `
        INSERT INTO "auth_refresh_tokens"
          ("userId", "jti", "familyId", "tokenHash", "issuedAt", "expiresAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [input.userId, input.jti, input.familyId, input.tokenHash, input.issuedAt, input.expiresAt],
    );

    return mapRow(result.rows[0]);
  }

  /**
   * Finds a refresh token by its JTI claim.
   *
   * @param jti - JWT ID.
   * @returns The token row or `null`.
   */
  async findByJti(jti: string): Promise<StoredRefreshTokenRow | null> {
    const result = await pool.query(
      `SELECT * FROM "auth_refresh_tokens" WHERE "jti" = $1 LIMIT 1`,
      [jti],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Atomically rotates a refresh token: inserts the new token and marks the current one as rotated.
   *
   * @param params - Current token ID and next token input.
   * @param params.currentTokenId - ID of the current token being rotated out.
   * @param params.next - Metadata for the new replacement token.
   * @returns The newly inserted token row.
   */
  async rotate(params: {
    currentTokenId: string;
    next: InsertRefreshTokenInput;
  }): Promise<StoredRefreshTokenRow> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `
          INSERT INTO "auth_refresh_tokens"
            ("userId", "jti", "familyId", "tokenHash", "issuedAt", "expiresAt")
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          params.next.userId,
          params.next.jti,
          params.next.familyId,
          params.next.tokenHash,
          params.next.issuedAt,
          params.next.expiresAt,
        ],
      );

      const nextRow = mapRow(insertResult.rows[0]);

      await client.query(
        `
          UPDATE "auth_refresh_tokens"
          SET "rotatedAt" = NOW(), "replacedByTokenId" = $2
          WHERE "id" = $1
        `,
        [params.currentTokenId, nextRow.id],
      );

      await client.query('COMMIT');
      return nextRow;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        /* best-effort rollback */
      });
      throw error;
    } finally {
      void client.release();
    }
  }

  /**
   * Revokes a single refresh token by its JTI.
   *
   * @param jti - JWT ID of the token to revoke.
   */
  async revokeByJti(jti: string): Promise<void> {
    await pool.query(
      `
        UPDATE "auth_refresh_tokens"
        SET "revokedAt" = COALESCE("revokedAt", NOW())
        WHERE "jti" = $1
      `,
      [jti],
    );
  }

  /**
   * Deletes expired refresh tokens in a bounded batch.
   *
   * @param limit - Maximum rows to delete per invocation.
   * @returns The number of rows actually deleted.
   */
  async deleteExpiredTokens(limit = 10000): Promise<number> {
    const result = await pool.query(
      'DELETE FROM "auth_refresh_tokens" WHERE "id" IN (SELECT "id" FROM "auth_refresh_tokens" WHERE "expiresAt" < NOW() LIMIT $1)',
      [limit],
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: rowCount may be null for certain pg drivers
    return result.rowCount ?? 0;
  }

  /**
   * Revokes all active refresh tokens for a user, optionally excluding one JTI.
   * Used after password change to invalidate all existing sessions.
   *
   * @param userId - The user's ID.
   * @param excludeJti - Optional JTI to exclude (e.g. the current session).
   */
  async revokeAllForUser(userId: number, excludeJti?: string): Promise<void> {
    await (excludeJti
      ? pool.query(
          `UPDATE "auth_refresh_tokens" SET "revokedAt" = NOW()
         WHERE "userId" = $1 AND "revokedAt" IS NULL AND "jti" != $2`,
          [userId, excludeJti],
        )
      : pool.query(
          `UPDATE "auth_refresh_tokens" SET "revokedAt" = NOW()
         WHERE "userId" = $1 AND "revokedAt" IS NULL`,
          [userId],
        ));
  }

  /**
   * Revokes all tokens in a token family, optionally marking reuse detection.
   *
   * @param familyId - Token family identifier.
   * @param reuseDetected - When `true`, also sets `reuseDetectedAt` on all family members.
   */
  async revokeFamily(familyId: string, reuseDetected = false): Promise<void> {
    await pool.query(
      `
        UPDATE "auth_refresh_tokens"
        SET
          "revokedAt" = COALESCE("revokedAt", NOW()),
          "reuseDetectedAt" = CASE WHEN $2 THEN COALESCE("reuseDetectedAt", NOW()) ELSE "reuseDetectedAt" END
        WHERE "familyId" = $1
      `,
      [familyId, reuseDetected],
    );
  }
}
