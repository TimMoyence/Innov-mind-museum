import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the art_keywords table used for dynamic guardrail enrichment.
 */
export class CreateArtKeywordsTable1775100000000 implements MigrationInterface {
  name = 'CreateArtKeywordsTable1775100000000';

  /** Apply the CreateArtKeywordsTable migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "art_keywords" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "keyword" character varying(200) NOT NULL,
        "locale" character varying(10) NOT NULL,
        "hitCount" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_art_keywords_keyword_locale" UNIQUE ("keyword", "locale"),
        CONSTRAINT "PK_art_keywords" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_art_keywords_locale_hit_count" ON "art_keywords" ("locale", "hitCount" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_art_keywords_created_at" ON "art_keywords" ("createdAt")`,
    );
  }

  /** Revert the CreateArtKeywordsTable migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_art_keywords_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_art_keywords_locale_hit_count"`);
    await queryRunner.query(`DROP TABLE "art_keywords"`);
  }
}
