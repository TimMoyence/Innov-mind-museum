import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class AddMuseumContextToSessions1772000000002 implements MigrationInterface {
  name = 'AddMuseumContextToSessions1772000000002';

  /** Apply the AddMuseumContextToSessions migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "title" character varying(256)`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "museumName" character varying(256)`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "visitContext" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "artwork_matches" ADD COLUMN IF NOT EXISTS "room" character varying(256)`,
    );
  }

  /** Revert the AddMuseumContextToSessions migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "artwork_matches" DROP COLUMN IF EXISTS "room"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP COLUMN IF EXISTS "visitContext"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP COLUMN IF EXISTS "museumName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP COLUMN IF EXISTS "title"`,
    );
  }
}
