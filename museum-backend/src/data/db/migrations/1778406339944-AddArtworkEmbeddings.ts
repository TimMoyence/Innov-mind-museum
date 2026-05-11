import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C3 Phase 3 — visual-similarity catalog table.
 *
 * Creates the `artwork_embeddings` catalog backing the `/chat/compare`
 * pipeline (run `2026-05-08-c3-image-comparative`). One row per artwork
 * variant identified by Wikidata QID. The SigLIP-base-patch16-224 embedding
 * is stored as `halfvec(768)` (pgvector ≥ 0.7 — design.md §9 D2) and indexed
 * with HNSW + `halfvec_ip_ops` (L2-normalised vectors → inner product is
 * equivalent to cosine).
 *
 * Why hand-edited rather than 100% TypeORM-generated:
 *   - TypeORM has no native `halfvec` type; the entity declares the column
 *     as `text` and this migration creates the column with the correct
 *     pgvector type via raw SQL.
 *   - TypeORM does not emit `CREATE EXTENSION IF NOT EXISTS vector` —
 *     migrations that consume pgvector types must do so themselves.
 *   - HNSW indexes and `CHECK` constraints on text-encoded enums cannot be
 *     expressed via TypeORM decorators today, so we issue them as raw SQL.
 *
 * License + image_source allow-lists are enforced at the DB layer via
 * `CHECK` constraints (defence-in-depth: the domain TS union and the
 * application validator are the first line, but the DB MUST refuse a
 * smuggled `cc-by-sa` row in V1 — spec §8 Q2 RESOLVED).
 *
 * `down()` drops the table + indexes + check constraints. It deliberately
 * leaves the `vector` extension installed: future migrations / app code
 * may depend on it once Phase 3 ships, and `DROP EXTENSION vector CASCADE`
 * is destructive enough to require a separate, explicit migration.
 */
export class AddArtworkEmbeddings1778406339944 implements MigrationInterface {
  name = 'AddArtworkEmbeddings1778406339944';

  /** Apply: install pgvector + create the catalog table, indexes, CHECK constraints. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Ensure pgvector is available (idempotent — no-op when already installed).
    //    Required for the `halfvec` type used by the `embedding` column.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // 2. Create the catalog table. The `embedding` column is declared as
    //    `halfvec(768)` directly (the entity declares it as `text` to keep
    //    TypeORM happy — repository code uses raw queries with `::halfvec`
    //    casts).
    await queryRunner.query(`
      CREATE TABLE "artwork_embeddings" (
        "qid"                     text NOT NULL,
        "museum_qid"              text,
        "title"                   text NOT NULL,
        "image_url"               text NOT NULL,
        "license"                 text NOT NULL,
        "image_source"            text NOT NULL,
        "embedding"               halfvec(768) NOT NULL,
        "embedding_model_version" text NOT NULL,
        "created_at"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_artwork_embeddings" PRIMARY KEY ("qid"),
        CONSTRAINT "CHK_artwork_embeddings_image_source"
          CHECK ("image_source" IN ('wikimedia', 'museum_api', 'manual')),
        CONSTRAINT "CHK_artwork_embeddings_license"
          CHECK ("license" IN ('public-domain', 'cc-0'))
      )
    `);

    // 3. Btree index on `museum_qid` so the optional `museumQids` filter
    //    (design §3 ArtworkEmbeddingRepository.findNearest opts) prunes the
    //    HNSW candidate set without a full table scan.
    await queryRunner.query(
      `CREATE INDEX "IDX_artwork_embeddings_museum_qid" ON "artwork_embeddings" ("museum_qid")`,
    );

    // 4. HNSW index for approximate nearest-neighbour search on the
    //    embedding. `halfvec_ip_ops` is the inner-product op class for the
    //    `halfvec` type — equivalent to cosine since vectors are
    //    L2-normalised at encode time. m=16 / ef_construction=64 are
    //    pgvector defaults — sufficient for ≤ 100k vectors (design §9 D2).
    await queryRunner.query(
      `CREATE INDEX "IDX_artwork_embeddings_hnsw" ON "artwork_embeddings" USING hnsw ("embedding" halfvec_ip_ops) WITH (m = 16, ef_construction = 64)`,
    );
  }

  /** Revert: drop indexes + table. The `vector` extension is left in place. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_artwork_embeddings_hnsw"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_artwork_embeddings_museum_qid"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "artwork_embeddings"`);
  }
}
