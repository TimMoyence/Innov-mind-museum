import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds category and updatedAt columns to art_keywords for offline sync support.
 */
export class AddArtKeywordCategoryAndUpdatedAt1775400000000 implements MigrationInterface {
  name = 'AddArtKeywordCategoryAndUpdatedAt1775400000000';

  /** Apply the AddArtKeywordCategoryAndUpdatedAt migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "art_keywords" ADD "category" character varying(50) NOT NULL DEFAULT 'general'`,
    );
    await queryRunner.query(
      `ALTER TABLE "art_keywords" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_art_keywords_updated_at" ON "art_keywords" ("updatedAt")`,
    );
  }

  /** Revert the AddArtKeywordCategoryAndUpdatedAt migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_art_keywords_updated_at"`);
    await queryRunner.query(`ALTER TABLE "art_keywords" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "art_keywords" DROP COLUMN "category"`);
  }
}
