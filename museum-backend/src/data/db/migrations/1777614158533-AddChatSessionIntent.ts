import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec A Task 1.2 — Materialize `intent` on `chat_sessions`.
 *
 * Adds the `intent` column (`varchar(16) NOT NULL DEFAULT 'default'`) to back
 * the `ChatSession.intent` field introduced at the entity level in Task 1.1.
 *
 * Hand-written rather than CLI-generated: the TypeORM diff against the current
 * dev database surfaced unrelated pre-existing drift (FK constraint renames on
 * `totp_secrets` / `user_consents`, `recovery_codes` jsonb cast, CONCURRENTLY
 * index recreation, `ChatSession.version` default removal). Bundling that
 * cleanup here would expand scope beyond Spec A T1.2 and risk conflicts with
 * parallel agents' work.
 *
 * Hand-written deviation: adds `IF NOT EXISTS` for idempotency, matching the
 * convention established in the two prior `chat_sessions` migrations
 * (`AddChatSessionPurgedAt`, `AddRefreshTokenLastRotatedAt`). Protects against
 * partially-migrated dev DB states (e.g. crash between T1.1 and T1.2, or
 * column hand-created during development). `down()` keeps a bare `DROP COLUMN`
 * — revert should fail loudly if state is unexpected.
 *
 * Spec: docs/superpowers/specs/2026-04-30-spec-a-cleanup-decisions-design.md
 */
export class AddChatSessionIntent1777614158533 implements MigrationInterface {
  name = 'AddChatSessionIntent1777614158533';

  /**
   * Add the `intent` column with a `'default'` default so existing rows
   * back-fill atomically and the entity's NOT NULL contract holds immediately.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "intent" character varying(16) NOT NULL DEFAULT 'default'`,
    );
  }

  /**
   * Drop the `intent` column. Reverse is safe: callers will fall back to the
   * pre-Task-1.1 behaviour where intent did not exist.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP COLUMN "intent"`);
  }
}
