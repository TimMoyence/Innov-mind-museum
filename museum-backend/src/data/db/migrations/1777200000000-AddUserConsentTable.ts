import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `user_consents` table used to persist GDPR Art.7 consent records
 * (grant + revoke history). Each row documents a single grant for a
 * (user, scope) pair with the policy version and the capture source. Revokes
 * stamp `revoked_at` without deleting the row so the audit trail is preserved.
 *
 * Handwritten (CLI-generated migration requires a live DB; docker-compose is
 * unavailable in this sandbox — same constraint applied to prior migrations
 * 1776700000000 / 1776871811000).
 */
export class AddUserConsentTable1777200000000 implements MigrationInterface {
  name = 'AddUserConsentTable1777200000000';

  /** Apply the AddUserConsentTable migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_consents" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL,
        "scope" varchar(64) NOT NULL,
        "version" varchar(32) NOT NULL,
        "granted_at" timestamp NOT NULL,
        "revoked_at" timestamp NULL,
        "source" varchar(32) NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_consents_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_consents_user_scope" ON "user_consents" ("user_id", "scope")`,
    );
  }

  /** Revert the AddUserConsentTable migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_consents_user_scope"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_consents"`);
  }
}
