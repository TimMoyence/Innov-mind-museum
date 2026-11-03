import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropMfa1793698363248 implements MigrationInterface {
  name = 'DropMfa1793698363248';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "mfa_enrollment_deadline"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_totp_secrets_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "totp_secrets"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "totp_secrets" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL,
        "secret_encrypted" varchar(512) NOT NULL,
        "enrolled_at" TIMESTAMPTZ NULL,
        "last_used_at" TIMESTAMPTZ NULL,
        "last_used_step" bigint NULL,
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
}
