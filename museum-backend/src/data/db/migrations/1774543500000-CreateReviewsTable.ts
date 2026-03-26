import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class CreateReviewsTable1774543500000 implements MigrationInterface {
  name = 'CreateReviewsTable1774543500000';

  /** Creates the reviews table with FK, CHECK constraints and indexes. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" integer NOT NULL,
        "userName" character varying(128) NOT NULL,
        "rating" smallint NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
        "comment" text NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected')),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reviews_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reviews_status" ON "reviews" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reviews_userId" ON "reviews" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reviews_createdAt" ON "reviews" ("createdAt" DESC)
    `);
  }

  /** Drops the reviews table and its indexes. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_reviews_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_reviews_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_reviews_status"`);
    await queryRunner.query(`DROP TABLE "reviews"`);
  }
}
