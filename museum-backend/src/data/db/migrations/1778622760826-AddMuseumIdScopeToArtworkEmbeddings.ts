import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * OWASP LLM08 — cross-tenant embedding scope.
 *
 * Adds the `museum_id` (integer) FK column on `artwork_embeddings` so the
 * `findNearest()` kNN search can be scoped to the requesting session's
 * museum tenant. This is the **internal tenant axis** (Musaium
 * `museums.id`), distinct from the pre-existing `museum_qid` column which
 * stores the **Wikidata QID** of the holding institution (an external,
 * shared public reference — Q19675 = "Louvre Museum", same for every
 * tenant referencing it).
 *
 * Scoping semantics — implemented at the repository layer (Phase 0):
 *   - `museum_id IS NULL` → row belongs to the **global public catalog**
 *     (Wikimedia / public museum APIs ingested by the catalog CLI). Visible
 *     to every tenant.
 *   - `museum_id = X`      → row belongs to **tenant X only** (e.g. a B2B
 *     museum's unpublished private holdings).
 *
 * The kNN predicate at query time will be
 *   `WHERE museum_id IS NULL OR museum_id = $tenantId`
 * — see `ArtworkEmbeddingRepositoryPg.findNearest()`.
 *
 * V1 (single-tenant B2C, no B2B contract live yet) has ZERO rows with a
 * non-NULL `museum_id`, so the global predicate degenerates to a no-op and
 * traffic patterns are unchanged. The column ships **before** the first
 * B2B onboarding so the read-path scoping does not require an emergency
 * refactor on a hot path the day a tenant goes live.
 *
 * Indexing — a btree on `museum_id` mirrors the existing
 * `IDX_artwork_embeddings_museum_qid` so the HNSW candidate set can be
 * pre-filtered without a full table scan once tenant rows exist. The HNSW
 * index itself remains untouched — pgvector HNSW does not natively support
 * payload filters, so the pre-filter falls back to a candidate-set narrow
 * via the btree before the kNN scoring step.
 *
 * Manually authored (per CLAUDE.md §Migration Governance "TypeORM diff
 * generator surfaces noise" note for `artwork_embeddings` — see the
 * `AddWikidataKbDump1778504875210` migration header).
 */
export class AddMuseumIdScopeToArtworkEmbeddings1778622760826 implements MigrationInterface {
  name = 'AddMuseumIdScopeToArtworkEmbeddings1778622760826';

  /**
   * Apply : add nullable `museum_id` column + FK to `museums(id)` + btree
   * index. NULL = global catalog; non-NULL = tenant-private row.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The tenant column. Nullable + ON DELETE SET NULL so the catalog
    //    row survives a tenant offboarding as a public-catalog entry
    //    rather than being silently lost (operator can then decide whether
    //    to delete it explicitly — defence-in-depth against accidental
    //    catalog loss).
    await queryRunner.query(`ALTER TABLE "artwork_embeddings" ADD COLUMN "museum_id" integer NULL`);
    await queryRunner.query(
      `ALTER TABLE "artwork_embeddings"
         ADD CONSTRAINT "FK_artwork_embeddings_museum_id"
         FOREIGN KEY ("museum_id") REFERENCES "museums"("id")
         ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // 2. Btree index. Mirrors `IDX_artwork_embeddings_museum_qid` so the
    //    optional tenant-scope filter can prune the HNSW candidate set.
    //    Partial index excluding NULLs would be smaller, but the read path
    //    queries `museum_id IS NULL OR museum_id = $1` — a partial index
    //    would only help one branch of that OR; a plain index covers both.
    await queryRunner.query(
      `CREATE INDEX "IDX_artwork_embeddings_museum_id" ON "artwork_embeddings" ("museum_id")`,
    );
  }

  /** Revert : drop FK + index + column. Order matters (constraint before column). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_artwork_embeddings_museum_id"`);
    await queryRunner.query(
      `ALTER TABLE "artwork_embeddings" DROP CONSTRAINT IF EXISTS "FK_artwork_embeddings_museum_id"`,
    );
    await queryRunner.query(`ALTER TABLE "artwork_embeddings" DROP COLUMN IF EXISTS "museum_id"`);
  }
}
