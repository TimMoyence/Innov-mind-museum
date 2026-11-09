import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUserDefaultLocale1794211120502 implements MigrationInterface {
  name = 'DropUserDefaultLocale1794211120502';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "default_locale"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "default_locale" character varying(8) NOT NULL DEFAULT 'en-US'`,
    );
  }
}
