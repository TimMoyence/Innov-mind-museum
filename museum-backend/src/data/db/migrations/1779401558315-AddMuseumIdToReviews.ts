import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-B7 — Add `reviews.museum_id` (Wave B C7 / M2).
 *
 * B2B multi-tenant scope for reviews. Threaded through createReview / list /
 * aggregate use cases so a museum operator only ever sees and aggregates their
 * own tenant's reviews. Combined with the rating range widening 1-5 → 0-10
 * (NPS) shipped in `review.schemas.ts` to enable per-tenant NPS aggregation.
 *
 * Shape :
 *   - `museum_id integer NULL` FK → `museums.id` (integer PK, cf.
 *     `museum.entity.ts:18-19` — NOT UUID; this is the internal tenant axis).
 *   - Nullable so existing reviews (pre-multi-tenant) survive the migration
 *     without backfill. NOT NULL would block the migration on any existing
 *     review row.
 *   - `ON DELETE SET NULL` — mirrors `FK_artwork_embeddings_museum_id`
 *     semantic : the review survives a tenant offboarding as an un-scoped
 *     row (operator decides whether to delete it explicitly) rather than
 *     being silently lost.
 *   - Partial index `IDX_reviews_museum_id` (where museum_id IS NOT NULL) —
 *     mirrors `IDX_support_tickets_assigned_to` partial-index pattern, keeps
 *     the index small while existing rows are migrated.
 *
 * Body authored by hand (per `docs/MIGRATION_GOVERNANCE.md` §6 — when
 * TypeORM's `migration:generate` surfaces unrelated baseline drift, the
 * intentional diff is isolated). The full generated diff also surfaced a
 * number of pre-existing baseline drifts (FK names, recovery_codes::jsonb
 * cast, embedding halfvec→text, IDX_users_deleted_at etc.) that originate
 * from migrations landed pre-2026-05-21 and are NOT this commit's concern —
 * they belong to a separate tech-debt sweep (mirrors the isolation pattern
 * applied to `1779381393403-AddWikidataQidToMuseums.ts` — Wave A T-A7).
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-C7a +
 *         design.md §4 M2 + tasks.md T-B7.
 */
export class AddMuseumIdToReviews1779401558315 implements MigrationInterface {
  name = 'AddMuseumIdToReviews1779401558315';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "museum_id" integer NULL`);
    await queryRunner.query(
      `ALTER TABLE "reviews"
         ADD CONSTRAINT "FK_reviews_museum_id"
         FOREIGN KEY ("museum_id") REFERENCES "museums"("id")
         ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_museum_id" ON "reviews" ("museum_id") WHERE "museum_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_reviews_museum_id"`);
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "FK_reviews_museum_id"`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "museum_id"`);
  }
}
