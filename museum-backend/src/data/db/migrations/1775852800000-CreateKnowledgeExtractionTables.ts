import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class CreateKnowledgeExtractionTables1775852800000 implements MigrationInterface {
  name = 'CreateKnowledgeExtractionTables1775852800000';

  /** Applies the migration: creates 3 knowledge extraction tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pg_trgm for fuzzy search indexes
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // 1. extracted_content — raw scraped content cache
    await queryRunner.query(`
      CREATE TABLE "extracted_content" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "url" character varying(2048) NOT NULL,
        "title" character varying(500) NOT NULL,
        "textContent" text NOT NULL,
        "scrapedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "contentHash" character varying(64) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'scraped',
        CONSTRAINT "PK_extracted_content" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_extracted_content_url" ON "extracted_content" ("url")`,
    );

    // 2. artwork_knowledge — LLM-structured artwork data
    await queryRunner.query(`
      CREATE TABLE "artwork_knowledge" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(500) NOT NULL,
        "artist" character varying(300),
        "period" character varying(200),
        "technique" character varying(200),
        "description" text NOT NULL,
        "historicalContext" text,
        "dimensions" character varying(100),
        "currentLocation" character varying(300),
        "sourceUrls" jsonb NOT NULL DEFAULT '[]',
        "confidence" double precision NOT NULL,
        "needsReview" boolean NOT NULL DEFAULT false,
        "locale" character varying(10) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_artwork_knowledge" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_artwork_knowledge_title_artist_locale" ON "artwork_knowledge" ("title", "artist", "locale")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artwork_knowledge_title_trgm" ON "artwork_knowledge" USING GIN ("title" gin_trgm_ops)`,
    );

    // 3. museum_enrichment — LLM-structured museum data
    await queryRunner.query(`
      CREATE TABLE "museum_enrichment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "museumId" integer,
        "name" character varying(300) NOT NULL,
        "openingHours" jsonb,
        "admissionFees" jsonb,
        "website" character varying(500),
        "collections" jsonb,
        "currentExhibitions" jsonb,
        "accessibility" jsonb,
        "sourceUrls" jsonb NOT NULL DEFAULT '[]',
        "confidence" double precision NOT NULL,
        "needsReview" boolean NOT NULL DEFAULT false,
        "locale" character varying(10) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_museum_enrichment" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_museum_enrichment_name_locale" ON "museum_enrichment" ("name", "locale")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_museum_enrichment_name_trgm" ON "museum_enrichment" USING GIN ("name" gin_trgm_ops)`,
    );

    // FK: museum_enrichment.museumId → museums.id
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" ADD CONSTRAINT "FK_museum_enrichment_museum" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops 3 knowledge extraction tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" DROP CONSTRAINT "FK_museum_enrichment_museum"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_museum_enrichment_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_museum_enrichment_name_locale"`);
    await queryRunner.query(`DROP TABLE "museum_enrichment"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_artwork_knowledge_title_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_artwork_knowledge_title_artist_locale"`);
    await queryRunner.query(`DROP TABLE "artwork_knowledge"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_extracted_content_url"`);
    await queryRunner.query(`DROP TABLE "extracted_content"`);
  }
}
