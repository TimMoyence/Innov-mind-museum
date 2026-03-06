import pool from '@src/data/db';

export interface StoredRefreshTokenRow {
  id: string;
  userId: number;
  jti: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  reuseDetectedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
}

interface InsertRefreshTokenInput {
  userId: number;
  jti: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}

const mapRow = (row: Record<string, unknown>): StoredRefreshTokenRow => {
  return {
    id: String(row.id),
    userId: Number(row.userId ?? row.userid),
    jti: String(row.jti),
    familyId: String(row.familyId ?? row.familyid),
    tokenHash: String(row.tokenHash ?? row.tokenhash),
    issuedAt: new Date(String(row.issuedAt ?? row.issuedat)),
    expiresAt: new Date(String(row.expiresAt ?? row.expiresat)),
    rotatedAt: row.rotatedAt ? new Date(String(row.rotatedAt)) : row.rotatedat ? new Date(String(row.rotatedat)) : null,
    revokedAt: row.revokedAt ? new Date(String(row.revokedAt)) : row.revokedat ? new Date(String(row.revokedat)) : null,
    reuseDetectedAt: row.reuseDetectedAt ? new Date(String(row.reuseDetectedAt)) : row.reusedetectedat ? new Date(String(row.reusedetectedat)) : null,
    replacedByTokenId: row.replacedByTokenId ? String(row.replacedByTokenId) : row.replacedbytokenid ? String(row.replacedbytokenid) : null,
    createdAt: new Date(String(row.createdAt ?? row.createdat)),
  };
};

export class RefreshTokenRepositoryPg {
  async insert(input: InsertRefreshTokenInput): Promise<StoredRefreshTokenRow> {
    const result = await pool.query(
      `
        INSERT INTO "auth_refresh_tokens"
          ("userId", "jti", "familyId", "tokenHash", "issuedAt", "expiresAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        input.userId,
        input.jti,
        input.familyId,
        input.tokenHash,
        input.issuedAt,
        input.expiresAt,
      ],
    );

    return mapRow(result.rows[0]);
  }

  async findByJti(jti: string): Promise<StoredRefreshTokenRow | null> {
    const result = await pool.query(
      `SELECT * FROM "auth_refresh_tokens" WHERE "jti" = $1 LIMIT 1`,
      [jti],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

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
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

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

