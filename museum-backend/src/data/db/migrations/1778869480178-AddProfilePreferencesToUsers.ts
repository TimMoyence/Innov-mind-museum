import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TD-2 — `users.default_locale|default_museum_mode|guide_level|data_mode|audio_description_mode`
 * columns for cross-device profile preference sync (Option B).
 *
 * Adds 5 NOT NULL columns with sensible defaults that mirror the FE defaults
 * (`en-US` / `true` / `beginner` / `auto` / `false`) so existing rows are
 * backfilled deterministically and the post-migration shape matches the FE
 * Zustand store defaults — no first-deploy disruption.
 *
 * CLI-generated then trimmed: the raw `migration:generate` diff also emitted
 * pre-existing dev-DB drift unrelated to TD-2 (totp_secrets / artwork_embeddings
 * / FK reordering / audit_logs index). Same trim pattern as
 * `AddUserTtsVoice1777722694031` (Spec C T2.2) and earlier additive migrations;
 * keeping the migration scope-pure prevents accidental destructive replays of
 * the dev-only drift on staging/prod.
 *
 * Spec: `.claude/skills/team/team-state/2026-05-15-td2-bootstrap-profile-cross-device/spec.md` §3.1
 * Design: same folder, `design.md` §3.2.
 */
export class AddProfilePreferencesToUsers1778869480178 implements MigrationInterface {
  name = 'AddProfilePreferencesToUsers1778869480178';

  /**
   * Add the 5 additive columns with FE-matching defaults so existing rows are
   * backfilled in one statement each (PgBouncer-safe: standard DDL, no
   * LISTEN/NOTIFY, no advisory locks, no prepared statements).
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "default_locale" character varying(8) NOT NULL DEFAULT 'en-US'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "default_museum_mode" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "guide_level" character varying(16) NOT NULL DEFAULT 'beginner'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "data_mode" character varying(8) NOT NULL DEFAULT 'auto'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "audio_description_mode" boolean NOT NULL DEFAULT false`,
    );
  }

  /**
   * Drop the 5 columns in reverse declaration order.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "audio_description_mode"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "data_mode"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "guide_level"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "default_museum_mode"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "default_locale"`);
  }
}
