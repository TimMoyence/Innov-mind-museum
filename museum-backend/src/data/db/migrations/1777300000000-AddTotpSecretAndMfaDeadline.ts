import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R16 — TOTP MFA support (SOC2 CC6.1).
 *
 * Two coupled schema operations, run in a single migration so a partial apply
 * cannot leave the auth subsystem in an inconsistent state:
 *
 *   1. CREATE TABLE `totp_secrets` — per-user encrypted shared secret +
 *      bcrypt-hashed recovery codes. One row per user (unique index on
 *      `user_id`). Cascading delete keeps GDPR account deletion clean.
 *   2. ALTER TABLE `users` ADD `mfa_enrollment_deadline TIMESTAMPTZ NULL` —
 *      drives the 30-day warning policy. Nullable for visitor users (who
 *      never get a deadline) and admins who have already enrolled.
 *
 * Handwritten because docker-compose is unavailable in this sandbox (same
 * constraint already documented for migrations 1776700000000 / 1776871811000
 * / 1777200000000). The `down()` is the symmetric inverse, exercised by the
 * Sentinelle revertibility sentinel.
 */
export class AddTotpSecretAndMfaDeadline1777300000000 implements MigrationInterface {
  name = 'AddTotpSecretAndMfaDeadline1777300000000';

  /** Apply: create totp_secrets + add users.mfa_enrollment_deadline. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "totp_secrets" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL,
        "secret_encrypted" varchar(512) NOT NULL,
        "enrolled_at" TIMESTAMPTZ NULL,
        "last_used_at" TIMESTAMPTZ NULL,
        "recovery_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_totp_secrets_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_totp_secrets_user" ON "totp_secrets" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mfa_enrollment_deadline" TIMESTAMPTZ NULL`,
    );
  }

  /** Revert: drop the column first (in case any FK ever references it), then the table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "mfa_enrollment_deadline"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_totp_secrets_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "totp_secrets"`);
  }
}
