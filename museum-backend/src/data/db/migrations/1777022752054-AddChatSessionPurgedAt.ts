import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M4 — Chat message retention (GDPR data minimization).
 *
 * Adds `purged_at` to `chat_sessions` so the daily purge cron can mark sessions
 * whose messages have been deleted past the retention window. `NULL` means the
 * session is live; once set the purge worker skips the row (idempotent).
 *
 * Scope deliberately narrow: only the new column. The full TypeORM schema diff
 * surfaced unrelated drift (FK / index renames, `user_memories` column renames,
 * enum conversions) that belongs to other teams — keeping this migration to the
 * single ADD COLUMN avoids regressions in staging and matches the pattern of
 * `AddRefreshTokenLastRotatedAt1777016924624`.
 */
export class AddChatSessionPurgedAt1777022752054 implements MigrationInterface {
  name = 'AddChatSessionPurgedAt1777022752054';

  /**
   * Add the `purged_at` column. `ADD COLUMN IF NOT EXISTS` keeps the migration
   * idempotent in environments where the column may already exist (partial
   * re-runs during development).
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMP`,
    );
  }

  /**
   * Drop the `purged_at` column. Reversing the retention cron is always safe —
   * the job treats missing rows / columns as "never purged" and will simply
   * re-run on the next tick.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP COLUMN "purged_at"`);
  }
}
