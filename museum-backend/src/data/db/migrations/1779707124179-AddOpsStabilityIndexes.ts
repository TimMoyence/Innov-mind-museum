import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I-OPS7 — three missing DB indexes added zero-downtime (CONCURRENTLY).
 *
 * Mirrors the A1 pattern (`AddCriticalChatIndexesP0`) — disables TypeORM's
 * BEGIN/COMMIT wrapper because Postgres rejects `CREATE INDEX CONCURRENTLY`
 * inside a transaction. `IF NOT EXISTS` makes `up` idempotent if the migration
 * is re-run after a mid-build interruption; the matching `DROP INDEX
 * CONCURRENTLY IF EXISTS` makes `down` idempotent.
 *
 * Indexes:
 *   - IDX_api_keys_user_id — FK column on `api_keys`, so the ON DELETE CASCADE
 *     from `users` uses an index scan instead of a Seq Scan (R5).
 *   - IDX_chat_sessions_userId_updatedAt_id — composite keyset for
 *     `listSessions` (`WHERE userId = ? ORDER BY updatedAt DESC, id DESC`) (R7).
 *   - IDX_chat_sessions_purged_at_active — partial index over the un-purged
 *     working set the GDPR retention purge cron scans
 *     (`WHERE purgedAt IS NULL AND updatedAt < NOW() - INTERVAL 'N days'`) (R6).
 *
 * File + class follow the repo convention `<timestamp>-Name.ts` /
 * `Name<timestamp>` (mirrors every sibling migration); the `name` property is
 * the timestamp the migrations table uses for ordering.
 *
 * Recovery runbook for INVALID indexes (after a CONCURRENTLY build is killed)
 * lives in docs/DB_BACKUP_RESTORE.md.
 */
export class AddOpsStabilityIndexes1779707124179 implements MigrationInterface {
  name = 'AddOpsStabilityIndexes1779707124179';
  public readonly transaction = false as const;

  /**
   * Builds the three stability indexes concurrently.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_api_keys_user_id" ` +
        `ON "api_keys" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_sessions_userId_updatedAt_id" ` +
        `ON "chat_sessions" ("userId", "updatedAt", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_sessions_purged_at_active" ` +
        `ON "chat_sessions" ("updatedAt") WHERE "purged_at" IS NULL`,
    );
  }

  /**
   * Drops the indexes in reverse order, also concurrently.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_sessions_purged_at_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_sessions_userId_updatedAt_id"`,
    );
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_api_keys_user_id"`);
  }
}
