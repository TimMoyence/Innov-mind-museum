import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec C Task 1.1 — Personalization fields on `user_memories`.
 *
 * Adds two nullable signal columns introduced at the entity level in Task 1.2
 * (commit `a074f8ec`):
 *  - `language_preference VARCHAR(10) NULL` — most-used locale across the
 *    user's chat sessions, refreshed by mergers in subsequent tasks.
 *  - `session_duration_p90_minutes INT NULL` — rolling P90 of session length,
 *    used by personalization to pace pacing/scope of generated content.
 *
 * Both columns are nullable so existing rows remain valid; population is the
 * responsibility of `user-memory.service` mergers landed in later Spec C
 * tasks.
 *
 * CLI-generated then trimmed: the raw `migration:generate` diff also emitted
 * an unrelated `ALTER TABLE "totp_secrets" ALTER COLUMN "recovery_codes" SET
 * DEFAULT '[]'::jsonb` line that reflects pre-existing dev-DB drift (same
 * drift documented in `AddChatSessionIntent1777614158533` for Spec A). That
 * line was stripped to keep the migration scope-pure to Spec C, matching the
 * Spec A precedent.
 *
 * Spec: see git log (deleted 2026-05-03 — Spec C Personalization + Voice Continuity, original in commit history)
 */
export class AddUserMemoryPersonalizationFields1777711360437 implements MigrationInterface {
  name = 'AddUserMemoryPersonalizationFields1777711360437';

  /**
   * Add the two nullable personalization columns.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "language_preference" character varying(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "session_duration_p90_minutes" integer`,
    );
  }

  /**
   * Drop the two columns in reverse order.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_memories" DROP COLUMN "session_duration_p90_minutes"`,
    );
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "language_preference"`);
  }
}
