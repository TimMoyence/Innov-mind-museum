import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionVersionColumn1774000000000 implements MigrationInterface {
  name = 'AddSessionVersionColumn1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN "version" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP COLUMN "version"`,
    );
  }
}
