import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class AddEmailVerification1773939685275 implements MigrationInterface {
  name = 'AddEmailVerification1773939685275';

  /** Apply the AddEmailVerification migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_verified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "verification_token" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "verification_token_expires" TIMESTAMP`);
    await queryRunner.query(
      `CREATE INDEX "idx_users_verification_token" ON "users" ("verification_token") WHERE "verification_token" IS NOT NULL`,
    );
  }

  /** Revert the AddEmailVerification migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_users_verification_token"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "verification_token_expires"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "verification_token"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified"`);
  }
}
