import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I-SEC8 / OWASP LLM08 — cross-tenant knowledge-base scope.
 *
 * Adds the `museum_id` (integer) FK column on `artwork_knowledge` so the
 * cartel-deeplink read (`ArtworkKnowledgeRepoPort.findById`, hit on every chat
 * turn that resolves `[CURRENT ARTWORK]`) can be scoped to the requesting
 * session's museum tenant. This is the **internal tenant axis** (Musaium
 * `museums.id`), the exact mirror of the C7 precedent shipped on
 * `artwork_embeddings` (`AddMuseumIdScopeToArtworkEmbeddings1778622760826`).
 *
 * Scoping semantics — enforced at the repository SQL layer (defense-in-depth):
 *   - `museum_id IS NULL` → row belongs to the **global public catalog**
 *     (Wikimedia / Wikidata / scraped public URLs ingested by the extraction
 *     worker, which has no museum context). Visible to every tenant.
 *   - `museum_id = X`      → row belongs to **tenant X only** (a B2B museum's
 *     unpublished private holdings).
 *
 * The read predicate at query time is
 *   `WHERE id = :id AND (:museumId IS NULL OR museum_id IS NULL OR museum_id = :museumId)`
 * — see `TypeOrmArtworkKnowledgeRepo.findById`.
 *
 * V1 (single-tenant B2C, no B2B contract live yet) has ZERO rows with a
 * non-NULL `museum_id`, so all existing rows stay global catalog (backfill is
 * the DDL nullable-default, no batch UPDATE). The column ships **before** the
 * first B2B onboarding so the read-path scoping does not require an emergency
 * refactor on the chat hot path the day a tenant goes live.
 *
 * Manually authored (per CLAUDE.md §Migration Governance "TypeORM diff
 * generator surfaces noise on the KE tables" note — the auto-generated diff
 * dragged in unrelated churn on `artwork_embeddings`/`totp_secrets`/etc. and
 * omitted the FK; the CLI was used only to seed the canonical timestamp).
 * Mirrors `AddMuseumIdScopeToArtworkEmbeddings1778622760826` byte-for-pattern.
 *
 * The pre-existing unique index `IDX_artwork_knowledge_title_artist_locale` is
 * left untouched.
 */
export class AddMuseumIdScopeToArtworkKnowledge1779697908683 implements MigrationInterface {
  name = 'AddMuseumIdScopeToArtworkKnowledge1779697908683';

  /**
   * Apply : add nullable `museum_id` column + FK to `museums(id)` + btree
   * index. NULL = global catalog; non-NULL = tenant-private row.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The tenant column. Nullable + ON DELETE SET NULL so the catalog row
    //    survives a tenant offboarding as a public-catalog entry rather than
    //    being silently lost (defence-in-depth against accidental catalog
    //    loss — mirror of the C7 embeddings choice).
    await queryRunner.query(`ALTER TABLE "artwork_knowledge" ADD COLUMN "museum_id" integer NULL`);
    await queryRunner.query(
      `ALTER TABLE "artwork_knowledge"
         ADD CONSTRAINT "FK_artwork_knowledge_museum_id"
         FOREIGN KEY ("museum_id") REFERENCES "museums"("id")
         ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // 2. Btree index so the `museum_id IS NULL OR museum_id = $1` scope filter
    //    can prune without a full scan once tenant rows exist. A plain (not
    //    partial) index covers both branches of the OR.
    await queryRunner.query(
      `CREATE INDEX "IDX_artwork_knowledge_museum_id" ON "artwork_knowledge" ("museum_id")`,
    );
  }

  /** Revert : drop index + FK + column. Order matters (index/constraint before column). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_artwork_knowledge_museum_id"`);
    await queryRunner.query(
      `ALTER TABLE "artwork_knowledge" DROP CONSTRAINT IF EXISTS "FK_artwork_knowledge_museum_id"`,
    );
    await queryRunner.query(`ALTER TABLE "artwork_knowledge" DROP COLUMN IF EXISTS "museum_id"`);
  }
}
