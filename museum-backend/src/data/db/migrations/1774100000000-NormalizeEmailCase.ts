import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeEmailCase1774100000000 implements MigrationInterface {
  name = 'NormalizeEmailCase1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users" SET email = LOWER(email) WHERE email != LOWER(email)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email_lower" ON "users" (LOWER(email))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_users_email_lower"`,
    );
  }
}
