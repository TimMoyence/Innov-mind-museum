import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A1 — P0 chat foreign-key indexes (zero-downtime CONCURRENTLY).
 *
 * Adds B-tree indexes on the three FK columns that today drive Seq Scans on
 * every chat detail screen, every replay, and every cascade delete:
 *   - chat_messages."sessionId"
 *   - chat_sessions."userId"
 *   - artwork_matches."messageId"
 *
 * Disables TypeORM's BEGIN/COMMIT wrapper because Postgres rejects
 * `CREATE INDEX CONCURRENTLY` inside a transaction. `IF NOT EXISTS` makes
 * `up` idempotent if the migration is re-run after a mid-build interruption;
 * the matching `DROP INDEX CONCURRENTLY IF EXISTS` makes `down` idempotent.
 *
 * Recovery runbook for INVALID indexes (after a CONCURRENTLY build is killed)
 * lives in docs/DB_BACKUP_RESTORE.md.
 *
 * Spec: docs/superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md
 */
export class AddCriticalChatIndexesP01777568348067 implements MigrationInterface {
  name = 'AddCriticalChatIndexesP01777568348067';
  public readonly transaction = false as const;

  /**
   * Builds the three P0 FK indexes concurrently.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_messages_sessionId" ` +
        `ON "chat_messages" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_sessions_userId" ` +
        `ON "chat_sessions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_artwork_matches_messageId" ` +
        `ON "artwork_matches" ("messageId")`,
    );
  }

  /**
   * Drops the indexes in reverse order, also concurrently.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_artwork_matches_messageId"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_sessions_userId"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_messages_sessionId"`);
  }
}
