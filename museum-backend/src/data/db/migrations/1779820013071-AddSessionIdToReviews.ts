import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C2 / R5 / Q3 — NPS attribution link on reviews.
 *
 * Adds `reviews.session_id` (uuid, nullable — no backfill of existing rows),
 * a FK → `chat_sessions(id)` with `ON DELETE SET NULL` (a purged session nulls
 * the link without corrupting the already-attributed `museum_id`, GDPR
 * retention coupling), and a partial index `IDX_reviews_session_id` excluding
 * NULLs (mirrors `IDX_reviews_museum_id`).
 *
 * Generated via `migration-cli generate` then trimmed to the session_id-only
 * diff: TypeORM's generator emitted unrelated drift noise (halfvec→text rewrite
 * on artwork_embeddings, FK/index churn on totp/user_consents/etc.) that is
 * pre-existing entity↔migration drift NOT introduced by this slice and out of
 * scope here. Additive + reversible; no SAVEPOINT (integration-harness safe,
 * CLAUDE.md piège).
 */
export class AddSessionIdToReviews1779820013071 implements MigrationInterface {
  name = 'AddSessionIdToReviews1779820013071';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ADD "session_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_session_id" ON "reviews" ("session_id") WHERE "session_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_ecbc75cbb93e18a8835aae78204" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_ecbc75cbb93e18a8835aae78204"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_reviews_session_id"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "session_id"`);
  }
}
