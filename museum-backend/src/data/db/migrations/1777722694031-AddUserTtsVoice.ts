import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec C Task 2.2 — `users.tts_voice` column for voice continuity.
 *
 * Adds a single nullable `VARCHAR(32)` column on `users` that stores the
 * visitor's preferred TTS voice (validated server-side against the catalog
 * landed in T2.1 — `voice-catalog.ts`). `NULL` means "use the env-level
 * default" (`env.tts.voice`). Reads are wired into `chat-media` in T2.3.
 *
 * CLI-generated then trimmed: the raw `migration:generate` diff also emitted:
 *  - The recurring `ALTER TABLE "totp_secrets" ALTER COLUMN "recovery_codes"
 *    SET DEFAULT '[]'::jsonb` line — pre-existing dev-DB drift, same trim
 *    documented in `AddChatSessionIntent1777614158533` (Spec A T1.2) and
 *    `AddUserMemoryPersonalizationFields1777711360437` (Spec C T1.1).
 *  - DROP/ADD passes on `chat_sessions.{createdAt,updatedAt,purged_at}` and
 *    `chat_messages.{audioGeneratedAt,createdAt}` — these columns are already
 *    `TIMESTAMP WITH TIME ZONE` after `ChatTimestamptz1777721420875`; the
 *    generator's DROP/ADD restatement is a destructive no-op that would also
 *    wipe row data. Stripped to keep the migration scope-pure to T2.2.
 *
 * Spec: see git log (deleted 2026-05-03 — Spec C Personalization + Voice Continuity, original in commit history)
 */
export class AddUserTtsVoice1777722694031 implements MigrationInterface {
  name = 'AddUserTtsVoice1777722694031';

  /**
   * Add the nullable `tts_voice` column.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "tts_voice" character varying(32)`);
  }

  /**
   * Drop the `tts_voice` column.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tts_voice"`);
  }
}
