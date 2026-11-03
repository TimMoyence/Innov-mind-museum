import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreArtKeywordUnique1793704563964 implements MigrationInterface {
  name = 'RestoreArtKeywordUnique1793704563964';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "art_keywords" ADD CONSTRAINT "UQ_art_keywords_keyword_locale" UNIQUE ("keyword", "locale")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "art_keywords" DROP CONSTRAINT "UQ_art_keywords_keyword_locale"`,
    );
  }
}
