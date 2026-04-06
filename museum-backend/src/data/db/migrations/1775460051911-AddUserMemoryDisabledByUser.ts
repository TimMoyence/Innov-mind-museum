import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds disabledByUser boolean column to user_memories for the memory opt-out feature.
 */
export class AddUserMemoryDisabledByUser1775460051911 implements MigrationInterface {
  name = 'AddUserMemoryDisabledByUser1775460051911';

  /** Apply the AddUserMemoryDisabledByUser migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "disabledByUser" boolean NOT NULL DEFAULT false`,
    );
  }

  /** Revert the AddUserMemoryDisabledByUser migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "disabledByUser"`);
  }
}
