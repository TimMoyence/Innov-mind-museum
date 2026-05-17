/**
 * Repository port for `artwork_embeddings`. PG adapter (Phase 4) uses pgvector
 * `<#>` inner-product kNN on a `halfvec(768)` HNSW index — design §9 D2.
 */

import type { ArtworkEmbedding } from './artworkEmbedding.entity';
import type { ArtworkMetadata, NearestResult } from './compare-result.types';

/**
 * One row written by the catalog ingest CLI (Phase 5+). Uses typed `vector`
 * rather than pgvector text serialisation — the repository handles the cast.
 */
export interface ArtworkEmbeddingRow {
  qid: string;
  /** L2-normalised, from `EmbeddingsPort.encode`. */
  vector: Float32Array;
  metadata: ArtworkMetadata;
  imageSource: ArtworkEmbedding['imageSource'];
  license: ArtworkEmbedding['license'];
  /** e.g. `"siglip-base-patch16-224@v1"`. */
  embeddingModelVersion: string;
  /**
   * Internal Musaium tenant FK (`museums.id`). NULL = global public catalog
   * (visible to every tenant); non-null pins to that single tenant. Distinct
   * from {@link ArtworkMetadata.museumQid} (Wikidata public reference).
   * OWASP LLM08 — see {@link FindNearestOptions.museumId}.
   */
  museumId?: number | null;
}

export interface FindNearestOptions {
  /**
   * **External public** axis (Wikidata Q-identifiers shared across all tenants
   * — Q19675 = "Louvre" for every caller). Implementations MUST translate this
   * into an indexed predicate on `museum_qid` so HNSW pre-filter stays cheap.
   * For tenant isolation use {@link museumId}.
   */
  museumQids?: string[];

  /**
   * **Internal tenant** scope (`museums.id`). When provided, repository MUST
   * filter `museum_id IS NULL OR museum_id = $museumId` — global rows PLUS
   * that tenant's private rows. Other tenants' private rows MUST NEVER be
   * returned.
   *
   * When omitted, implementations SHOULD warn-log and fall back to the
   * global read for V1 single-tenant backward compatibility. B2B onboarding
   * checklist must flip every caller to pass explicit `museumId` before the
   * first paying tenant goes live (OWASP LLM08).
   */
  museumId?: number | null;
}

/** `updated` + `skipped` dominate on idempotent reruns. */
export interface UpsertBatchResult {
  inserted: number;
  /** Different vector / metadata / model version. */
  updated: number;
  /** Same vector + same model version. */
  skipped: number;
}

/**
 * All methods MUST be safe under concurrent requests — implementations rely on
 * Postgres transactional semantics, not in-process locks.
 */
export interface ArtworkEmbeddingRepository {
  /**
   * `topN` closest rows ordered by ascending inner-product distance.
   * `visualScore` already mapped to `[0, 1]`.
   *
   * @param query - L2-normalised, length must match `EMBEDDINGS_DIM`.
   * @throws {Error} nothing — empty array when catalog empty or no row matches filters.
   */
  findNearest(
    query: Float32Array,
    topN: number,
    opts?: FindNearestOptions,
  ): Promise<NearestResult[]>;

  /**
   * Idempotent batch upsert keyed by `qid`. SHOULD wrap in a single transaction
   * so a partial crash doesn't leave the catalog half-ingested.
   */
  upsertBatch(rows: ArtworkEmbeddingRow[]): Promise<UpsertBatchResult>;

  findByQid(qid: string): Promise<ArtworkEmbedding | null>;

  /** Used by `artwork_embeddings_count` Grafana gauge (design §10). */
  count(): Promise<number>;
}
