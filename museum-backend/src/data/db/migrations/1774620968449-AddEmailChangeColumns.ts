import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds email change columns (pending_email, email_change_token, email_change_token_expiry) to users table. */
export class AddEmailChangeColumns1774620968449 implements MigrationInterface {
  name = 'AddEmailChangeColumns1774620968449';

  /** Apply migration: add email change columns. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "pending_email" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "email_change_token" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "email_change_token_expiry" TIMESTAMP`);
  }

  /** Revert migration: drop email change columns. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_change_token_expiry"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_change_token"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pending_email"`);
  }
}
