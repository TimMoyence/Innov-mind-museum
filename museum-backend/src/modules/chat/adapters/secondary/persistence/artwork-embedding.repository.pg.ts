/**
 * C3 Phase 4 — `ArtworkEmbeddingRepositoryPg` (ADR-037).
 *
 * Backs migration `1778406339944-AddArtworkEmbeddings`.
 *
 * Schema/gotchas:
 *  - `embedding` column is `halfvec(768)` (FP16, pgvector ≥ 0.7.0). TypeORM
 *    has no native halfvec type → all I/O is raw SQL with `::halfvec` casts.
 *    Vectors serialise to pgvector text literal `"[v1,v2,…]"`.
 *  - kNN uses inner-product op `<#>` (returns NEGATIVE IP). Vectors are
 *    L2-unit at encode time, so `<#>` ∈ [-1, 1]; we rescale to [0, 1] via
 *    `(1 - (e <#> q)) / 2` (1=identical, 0.5=orthogonal). `ORDER BY <#> ASC`
 *    puts closest first.
 *  - upsertBatch is idempotent: rows with identical `(vector, model_version)`
 *    are `skipped` (not UPDATEd) so `updated_at` is preserved across re-runs
 *    of the catalog ingest CLI. Classification + write share one transaction.
 */
import { logger } from '@shared/logger/logger';

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

interface ArtworkEmbeddingSqlRow {
  qid: string;
  museum_qid: string | null;
  museum_id: number | null;
  title: string;
  image_url: string;
  license: ArtworkEmbedding['license'];
  image_source: ArtworkEmbedding['imageSource'];
  embedding: string;
  embedding_model_version: string;
  created_at: Date;
  updated_at: Date;
}

interface ArtworkEmbeddingNearestSqlRow extends ArtworkEmbeddingSqlRow {
  /** `(1 - (embedding <#> query)) / 2` — node-postgres may yield string for numeric. */
  similarity: number | string;
}

/** Serialises a vector to pgvector text literal `[v1,v2,…]` (consumed by ::halfvec). */
const serialiseVector = (vector: Float32Array): string => `[${Array.from(vector).join(',')}]`;

const toEntity = (row: ArtworkEmbeddingSqlRow): ArtworkEmbedding => ({
  qid: row.qid,
  museumQid: row.museum_qid,
  museumId: row.museum_id,
  title: row.title,
  imageUrl: row.image_url,
  license: row.license,
  imageSource: row.image_source,
  embedding: row.embedding,
  embeddingModelVersion: row.embedding_model_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Catalog stores card-render subset; full Wikidata facts hydrated downstream (T4.6). */
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
 * Concurrent-safe; relies exclusively on Postgres transactional semantics
 * (no in-process locks).
 */
export class ArtworkEmbeddingRepositoryPg implements ArtworkEmbeddingRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Two orthogonal filters:
   *  - `museumQids` (Wikidata external axis) → `museum_qid = ANY($2)`
   *  - `museumId` (OWASP LLM08 internal tenant axis) →
   *    `museum_id IS NULL OR museum_id = $4`. NULL branch = global public
   *    catalog. **`museumId === undefined`** → predicate omitted (legacy
   *    global read) + warn logged so B2B onboarding can grep + fix before
   *    first tenant. V1 single-tenant has no non-NULL museum_id rows so
   *    unscoped path is leakage-free by construction (silence warn before B2B).
   */
  async findNearest(
    query: Float32Array,
    topN: number,
    opts: FindNearestOptions = {},
  ): Promise<NearestResult[]> {
    const queryLiteral = serialiseVector(query);
    const museumQids = opts.museumQids ?? null;
    // Only a positive integer activates tenant scope; null/undefined both = legacy global read.
    const museumId = typeof opts.museumId === 'number' ? opts.museumId : null;
    if (museumId === null) {
      // OWASP LLM08 — grep this line to fix unscoped callers before B2B.
      logger.warn('artwork_embeddings_find_nearest_unscoped', {
        reason: 'museumId not provided — global read (cross-tenant scope disabled)',
        topN,
        museumQidsCount: museumQids?.length ?? 0,
      });
    }

    const rows: ArtworkEmbeddingNearestSqlRow[] = await this.dataSource.query(
      `SELECT qid, museum_qid, museum_id, title, image_url, license, image_source,
              embedding, embedding_model_version, created_at, updated_at,
              ((1 - (embedding <#> $1::halfvec)) / 2) AS similarity
       FROM artwork_embeddings
       WHERE ($2::text[] IS NULL OR museum_qid = ANY($2::text[]))
         AND ($4::integer IS NULL OR museum_id IS NULL OR museum_id = $4::integer)
       ORDER BY embedding <#> $1::halfvec
       LIMIT $3`,
      [queryLiteral, museumQids, topN, museumId],
    );

    return rows.map((row) => ({
      qid: row.qid,
      visualScore: typeof row.similarity === 'string' ? Number(row.similarity) : row.similarity,
      metadata: toNearestMetadata(row),
      modelVersion: row.embedding_model_version,
    }));
  }

  /**
   * Idempotent (key=qid). Single transaction: (1) classify via VALUES CTE on
   * `(vector, model_version)` → skipped iff identical; (2) write non-skipped
   * via `INSERT … ON CONFLICT (qid) DO UPDATE`. `updated_at` only bumps on
   * actual changes. Empty input short-circuits without a DB call.
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

  /** `skipMask[i]=true` → drop row i from the INSERT batch (already up-to-date). */
  private async classifyRows(
    manager: EntityManager,
    rows: ArtworkEmbeddingRow[],
  ): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
    skipMask: boolean[];
  }> {
    // 3 placeholders per row: (qid, embedding, model_version).
    const valuesClauses: string[] = [];
    const params: string[] = [];
    for (const [idx, row] of rows.entries()) {
      const base = idx * 3;
      valuesClauses.push(
        `($${String(base + 1)}, $${String(base + 2)}::halfvec, $${String(base + 3)})`,
      );
      params.push(row.qid, serialiseVector(row.vector), row.embeddingModelVersion);
    }

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
    const classified: { qid: string; is_insert: boolean; is_skip: boolean }[] = await manager.query(
      sql,
      params,
    );

    const byQid = new Map<string, { is_insert: boolean; is_skip: boolean }>();
    for (const row of classified) {
      byQid.set(row.qid, { is_insert: row.is_insert, is_skip: row.is_skip });
    }

    const skipMask: boolean[] = Array.from({ length: rows.length }, () => false);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const [idx, row] of rows.entries()) {
      const verdict = byQid.get(row.qid);
      if (!verdict) {
        // Defensive — SQL/input shape divergence; treat as insert, let DB raise on conflict.
        inserted += 1;
        continue;
      }
      if (verdict.is_skip) {
        skipped += 1;
        skipMask[idx] = true;
      } else if (verdict.is_insert) {
        inserted += 1;
      } else {
        updated += 1;
      }
    }

    return { inserted, updated, skipped, skipMask };
  }

  /**
   * 9 placeholders/row + `updated_at = now()` on conflict (concurrent ingests
   * cannot regress it). `museum_id` (OWASP LLM08 tenant, `museums.id`) ≠
   * `museum_qid` (Wikidata public ref). Both default NULL.
   */
  private async writeBatch(manager: EntityManager, rows: ArtworkEmbeddingRow[]): Promise<void> {
    const valuesClauses: string[] = [];
    const params: (string | number | null)[] = [];

    for (const [idx, row] of rows.entries()) {
      const base = idx * 9;
      valuesClauses.push(
        `($${String(base + 1)}, $${String(base + 2)}, $${String(base + 3)}, ` +
          `$${String(base + 4)}, $${String(base + 5)}, $${String(base + 6)}, ` +
          `$${String(base + 7)}, $${String(base + 8)}::halfvec, $${String(base + 9)})`,
      );
      params.push(
        row.qid,
        row.metadata.museumQid ?? null,
        row.museumId ?? null,
        row.metadata.title,
        row.metadata.imageUrl,
        row.license,
        row.imageSource,
        serialiseVector(row.vector),
        row.embeddingModelVersion,
      );
    }

    const sql = `
      INSERT INTO artwork_embeddings
        (qid, museum_qid, museum_id, title, image_url, license, image_source, embedding, embedding_model_version)
      VALUES ${valuesClauses.join(', ')}
      ON CONFLICT (qid) DO UPDATE SET
        museum_qid              = EXCLUDED.museum_qid,
        museum_id               = EXCLUDED.museum_id,
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

  async findByQid(qid: string): Promise<ArtworkEmbedding | null> {
    const rows: ArtworkEmbeddingSqlRow[] = await this.dataSource.query(
      `SELECT qid, museum_qid, museum_id, title, image_url, license, image_source,
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

  /** Backs `artwork_embeddings_count` Grafana gauge (design §10). */
  async count(): Promise<number> {
    const rows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*)::text AS count FROM artwork_embeddings`,
    );
    return Number(rows[0].count);
  }
}
