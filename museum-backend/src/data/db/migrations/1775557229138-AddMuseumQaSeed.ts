import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the museum_qa_seed table with a composite index on (museumId, locale)
 * for the low-data pack pre-fetch feature.
 */
export class AddMuseumQaSeed1775557229138 implements MigrationInterface {
  name = 'AddMuseumQaSeed1775557229138';

  /** Apply the AddMuseumQaSeed migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "museum_qa_seed" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "museumId" character varying(64) NOT NULL, "locale" character varying(8) NOT NULL, "question" text NOT NULL, "answer" text NOT NULL, "metadata" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a7410292627d8e92f2f4c38cbd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_067f006269c131dc9041317509" ON "museum_qa_seed" ("museumId", "locale") `,
    );
  }

  /** Revert the AddMuseumQaSeed migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_067f006269c131dc9041317509"`);
    await queryRunner.query(`DROP TABLE "museum_qa_seed"`);
  }
}
