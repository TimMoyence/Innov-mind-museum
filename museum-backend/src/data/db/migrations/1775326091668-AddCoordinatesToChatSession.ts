import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds a nullable `coordinates` JSONB column to the `chat_sessions` table. */
export class AddCoordinatesToChatSession1775326091668 implements MigrationInterface {
  name = 'AddCoordinatesToChatSession1775326091668';

  /** Adds the `coordinates` JSONB column. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_sessions" ADD "coordinates" jsonb`);
  }

  /** Removes the `coordinates` column. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP COLUMN "coordinates"`);
  }
}
