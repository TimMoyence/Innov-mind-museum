import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `content_preferences` (text[]) column to users table for the P1 user profile
 * feature. Stores which aspects the visitor prefers to learn about an artwork:
 * 'history', 'technique', 'artist'. Defaults to empty array (no preference).
 *
 * Nullable=false + default='{}' so existing users get a safe, empty default without
 * backfill. Zero downtime migration.
 */
export class AddUserContentPreferences1776276072750 implements MigrationInterface {
  name = 'AddUserContentPreferences1776276072750';

  /** Apply the AddUserContentPreferences migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "content_preferences" text array NOT NULL DEFAULT '{}'`,
    );
  }

  /** Revert the AddUserContentPreferences migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "content_preferences"`);
  }
}
