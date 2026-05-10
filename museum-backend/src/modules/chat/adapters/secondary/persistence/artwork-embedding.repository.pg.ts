/**
 * C3 Phase 4 — `ArtworkEmbeddingRepositoryPg` — PostgreSQL + pgvector adapter.
 *
 * Implements {@link ArtworkEmbeddingRepository} on top of the `artwork_embeddings`
 * table created by migration `1778406339944-AddArtworkEmbeddings`.
 *
 * Key design points (cf. design.md §3 / §4 / §9 D2 — see also tasks.md T4.5):
 *   - The `embedding` column is `halfvec(768)`. TypeORM has no native halfvec
 *     type, so all I/O on this column goes through raw SQL with explicit
 *     `::halfvec` casts. Vectors are serialised as the pgvector text literal
 *     `"[v1,v2,…]"` form on the way in and parsed lazily on the way out.
 *   - kNN search uses the inner-product operator `<#>`, which returns the
 *     *negative* inner product. Embeddings are L2-normalised at encode time,
 *     so `1 - (embedding <#> query)` is mapped into `[0, 1]` and equivalent
 *     to cosine similarity rescaled. `ORDER BY <#>` ascending therefore puts
 *     the closest match first.
 *   - {@link upsertBatch} is idempotent: rows whose `(vector, model_version)`
 *     pair matches what is already persisted are reported as `skipped` and
 *     never UPDATEd, so reruns of the catalog ingest CLI do not bump
 *     `updated_at` for rows that did not actually change. Inserted vs
 *     updated vs skipped is determined up-front via a single CTE round-trip
 *     against `artwork_embeddings`, then a second `INSERT … ON CONFLICT (qid)
 *     DO UPDATE` writes only the non-skipped rows. The whole sequence runs
 *     inside a single transaction so a partial crash never leaves the
 *     catalog half-ingested.
 */
import type { ArtworkEmbedding } from '@modules/chat/domain/visual-similarity/artworkEmbedding.entity';
import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
  FindNearestOptions,
  UpsertBatchResult,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type {
  ArtworkMetadata,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Shape of a single SQL row returned by the `findNearest` / `findByQid`
 * SELECT statements. Mirrors the column list emitted by the queries below so
 * the row → domain mapping stays exhaustive when a column is added later.
 */
interface ArtworkEmbeddingSqlRow {
  qid: string;
  museum_qid: string | null;
  title: string;
  image_url: string;
  license: ArtworkEmbedding['license'];
  image_source: ArtworkEmbedding['imageSource'];
  embedding: string;
  embedding_model_version: string;
  created_at: Date;
  updated_at: Date;
}

/** Shape of the row returned by `findNearest` (adds the computed similarity). */
interface ArtworkEmbeddingNearestSqlRow extends ArtworkEmbeddingSqlRow {
  /** `1 - (embedding <#> query)` cast to JS number by node-postgres. */
  similarity: number | string;
}

/**
 * Serialise a `Float32Array` into the pgvector text literal expected by a
 * `::halfvec` cast. `Array.from(...).join(',')` formats every component with
 * `Number#toString` (no trailing zeros), which matches the format pgvector
 * accepts as input. The output is wrapped in `[…]`.
 */
const serialiseVector = (vector: Float32Array): string =>
  `[${Array.from(vector).join(',')}]`;

/**
 * Map a flat SQL row onto the domain {@link ArtworkEmbedding} entity. Used by
 * `findByQid` — `findNearest` returns the lighter {@link NearestResult} shape.
 */
const toEntity = (row: ArtworkEmbeddingSqlRow): ArtworkEmbedding => ({
  qid: row.qid,
  museumQid: row.museum_qid,
  title: row.title,
  imageUrl: row.image_url,
  license: row.license,
  imageSource: row.image_source,
  embedding: row.embedding,
  embeddingModelVersion: row.embedding_model_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Hydrate the {@link ArtworkMetadata} snapshot returned by `findNearest` from
 * the flat catalog columns. The catalog stores only the subset needed to
 * render a card (title + imageUrl + museumQid); richer Wikidata facts are
 * hydrated on the read path by the Wikidata enricher (see tasks.md T4.6).
 */
const toNearestMetadata = (row: ArtworkEmbeddingSqlRow): ArtworkMetadata => {
  const metadata: ArtworkMetadata = {
    title: row.title,
    imageUrl: row.image_url,
  };
  if (row.museum_qid !== null) {
    metadata.museumQid = row.museum_qid;
  }
  return metadata;
};

/**
 * pgvector / TypeORM/pg adapter for the `artwork_embeddings` catalog. All
 * methods are safe to call from concurrent requests — implementations rely
 * exclusively on Postgres transactional semantics, no in-process locks.
 */
export class ArtworkEmbeddingRepositoryPg implements ArtworkEmbeddingRepository {
  /**
   * Build the repository on top of an initialised TypeORM `DataSource`.
   *
   * The constructor stores the data source on a readonly field; the
   * underlying connection pool is used for read-only raw queries
   * (`dataSource.query`), and multi-statement writes are wrapped in
   * `dataSource.transaction(...)` so a partial crash never leaves the
   * catalog half-ingested.
   *
   * @param dataSource - Initialised TypeORM `DataSource` bound to a Postgres
   *   instance with the `vector` extension installed (see migration
   *   `1778406339944-AddArtworkEmbeddings`).
   */
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Returns the `topN` closest catalog rows to the query embedding, ordered
   * by ascending pgvector inner-product distance (closest first). The
   * `visualScore` field is mapped into `[0, 1]` via `1 - <#>`.
   *
   * The optional `museumQids` filter is applied via `museum_qid = ANY($2)`
   * so the btree index on `museum_qid` (Phase 3 migration) prunes the HNSW
   * candidate set without a full table scan.
   */
  async findNearest(
    query: Float32Array,
    topN: number,
    opts: FindNearestOptions = {},
  ): Promise<NearestResult[]> {
    const queryLiteral = serialiseVector(query);
    const museumQids = opts.museumQids ?? null;

    const rows: ArtworkEmbeddingNearestSqlRow[] = await this.dataSource.query(
      `SELECT qid, museum_qid, title, image_url, license, image_source,
              embedding, embedding_model_version, created_at, updated_at,
              1 - (embedding <#> $1::halfvec) AS similarity
       FROM artwork_embeddings
       WHERE ($2::text[] IS NULL OR museum_qid = ANY($2::text[]))
       ORDER BY embedding <#> $1::halfvec
       LIMIT $3`,
      [queryLiteral, museumQids, topN],
    );

    return rows.map((row) => ({
      qid: row.qid,
      visualScore: typeof row.similarity === 'string' ? Number(row.similarity) : row.similarity,
      metadata: toNearestMetadata(row),
      modelVersion: row.embedding_model_version,
    }));
  }

  /**
   * Idempotent batch upsert keyed by `qid`. Runs in two stages inside a
   * single transaction:
   *
   *   1. Classify every input row as `inserted` / `updated` / `skipped` by
   *      joining a VALUES CTE against the existing catalog. A row is
   *      `skipped` iff it already exists with the same vector AND the same
   *      `embedding_model_version`.
   *   2. Issue a single `INSERT … ON CONFLICT (qid) DO UPDATE` for the
   *      non-skipped rows so `updated_at` is only bumped on rows that
   *      actually changed.
   *
   * Returns aggregate counts. An empty input yields `{0,0,0}` without
   * touching the database.
   */
  async upsertBatch(rows: ArtworkEmbeddingRow[]): Promise<UpsertBatchResult> {
    if (rows.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    return await this.dataSource.transaction(async (manager) => {
      const counts = await this.classifyRows(manager, rows);
      const toWrite = rows.filter((_, index) => !counts.skipMask[index]);
      if (toWrite.length > 0) {
        await this.writeBatch(manager, toWrite);
      }
      return {
        inserted: counts.inserted,
        updated: counts.updated,
        skipped: counts.skipped,
      };
    });
  }

  /**
   * Classify every input row by comparing it to its existing row (if any) on
   * `(embedding, embedding_model_version)`. Done in a single round-trip via
   * a VALUES-driven CTE so the upsert path is `O(rows)` SELECTs even for
   * 100-row batches.
   *
   * The returned `skipMask[i] === true` means "row i must NOT be written
   * back" and the caller should drop it from the INSERT batch.
   */
  private async classifyRows(
    manager: EntityManager,
    rows: ArtworkEmbeddingRow[],
  ): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
    skipMask: boolean[];
  }> {
    // Build one VALUES tuple per row : (qid, embedding, model_version).
    // Each row contributes 3 placeholders, ordered (qid, embedding, model_version).
    const valuesClauses: string[] = [];
    const params: string[] = [];
    rows.forEach((row, idx) => {
      const base = idx * 3;
      valuesClauses.push(`($${String(base + 1)}, $${String(base + 2)}::halfvec, $${String(base + 3)})`);
      params.push(row.qid, serialiseVector(row.vector), row.embeddingModelVersion);
    });

    const sql = `
      WITH input(qid, embedding, model_version) AS (
        VALUES ${valuesClauses.join(', ')}
      )
      SELECT i.qid AS qid,
             (e.qid IS NULL) AS is_insert,
             COALESCE(e.qid IS NOT NULL
                      AND e.embedding = i.embedding
                      AND e.embedding_model_version = i.model_version, false) AS is_skip
      FROM input i
      LEFT JOIN artwork_embeddings e ON e.qid = i.qid
    `;
    const classified: { qid: string; is_insert: boolean; is_skip: boolean }[] =
      await manager.query(sql, params);

    // Re-index the result by qid so we can walk `rows` in original order.
    const byQid = new Map<string, { is_insert: boolean; is_skip: boolean }>();
    for (const row of classified) {
      byQid.set(row.qid, { is_insert: row.is_insert, is_skip: row.is_skip });
    }

    const skipMask: boolean[] = Array.from({ length: rows.length }, () => false);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    rows.forEach((row, idx) => {
      const verdict = byQid.get(row.qid);
      if (!verdict) {
        // Defensive : a missing CTE row would only happen if the SQL diverged
        // from the input shape. Treat as "must insert" so we still write the
        // row and let the DB raise on any genuine conflict.
        inserted += 1;
        return;
      }
      if (verdict.is_skip) {
        skipped += 1;
        skipMask[idx] = true;
      } else if (verdict.is_insert) {
        inserted += 1;
      } else {
        updated += 1;
      }
    });

    return { inserted, updated, skipped, skipMask };
  }

  /**
   * Write the non-skipped rows via a single multi-VALUES `INSERT … ON
   * CONFLICT (qid) DO UPDATE`. Each row contributes seven placeholders
   * (qid, museum_qid, title, image_url, license, image_source, embedding,
   * embedding_model_version) — the eighth column `updated_at` is bumped via
   * `now()` on the conflict path so concurrent ingests cannot regress it.
   */
  private async writeBatch(
    manager: EntityManager,
    rows: ArtworkEmbeddingRow[],
  ): Promise<void> {
    const valuesClauses: string[] = [];
    const params: (string | null)[] = [];

    rows.forEach((row, idx) => {
      const base = idx * 8;
      valuesClauses.push(
        `($${String(base + 1)}, $${String(base + 2)}, $${String(base + 3)}, ` +
          `$${String(base + 4)}, $${String(base + 5)}, $${String(base + 6)}, ` +
          `$${String(base + 7)}::halfvec, $${String(base + 8)})`,
      );
      params.push(
        row.qid,
        row.metadata.museumQid ?? null,
        row.metadata.title,
        row.metadata.imageUrl,
        row.license,
        row.imageSource,
        serialiseVector(row.vector),
        row.embeddingModelVersion,
      );
    });

    const sql = `
      INSERT INTO artwork_embeddings
        (qid, museum_qid, title, image_url, license, image_source, embedding, embedding_model_version)
      VALUES ${valuesClauses.join(', ')}
      ON CONFLICT (qid) DO UPDATE SET
        museum_qid              = EXCLUDED.museum_qid,
        title                   = EXCLUDED.title,
        image_url               = EXCLUDED.image_url,
        license                 = EXCLUDED.license,
        image_source            = EXCLUDED.image_source,
        embedding               = EXCLUDED.embedding,
        embedding_model_version = EXCLUDED.embedding_model_version,
        updated_at              = now()
    `;
    await manager.query(sql, params);
  }

  /**
   * Look up a single catalog row by Wikidata QID. Returns `null` when no row
   * matches — the read path is read-only so no transaction wrapper is needed.
   */
  async findByQid(qid: string): Promise<ArtworkEmbedding | null> {
    const rows: ArtworkEmbeddingSqlRow[] = await this.dataSource.query(
      `SELECT qid, museum_qid, title, image_url, license, image_source,
              embedding, embedding_model_version, created_at, updated_at
       FROM artwork_embeddings
       WHERE qid = $1
       LIMIT 1`,
      [qid],
    );
    if (rows.length === 0) {
      return null;
    }
    return toEntity(rows[0]);
  }

  /**
   * Return the total number of rows in the catalog. Backs the
   * `artwork_embeddings_count` Grafana gauge (design §10) — we therefore
   * keep this on a dedicated method rather than paginating callers.
   */
  async count(): Promise<number> {
    const rows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*)::text AS count FROM artwork_embeddings`,
    );
    return Number(rows[0].count);
  }
}
