import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRoleColumn1774200000000 implements MigrationInterface {
  name = 'AddUserRoleColumn1774200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role_enum" AS ENUM ('visitor', 'moderator', 'museum_manager', 'admin')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "user_role_enum" NOT NULL DEFAULT 'visitor'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
