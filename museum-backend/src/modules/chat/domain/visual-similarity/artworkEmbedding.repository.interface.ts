/**
 * Repository port for the `artwork_embeddings` catalog table.
 *
 * The PostgreSQL adapter (Phase 4) implements the inner-product kNN search
 * via pgvector's `<#>` operator on a `halfvec(768)` HNSW index — see
 * design §9 D2.
 */

import type { ArtworkEmbedding } from './artworkEmbedding.entity';
import type { ArtworkMetadata, NearestResult } from './compare-result.types';

/**
 * One row written by the catalog ingest CLI (Phase 5+). Mirrors
 * {@link ArtworkEmbedding} but uses a typed `vector` rather than the
 * pgvector text serialisation — the repository handles the cast.
 */
export interface ArtworkEmbeddingRow {
  /** Wikidata QID acting as the primary key. */
  qid: string;
  /** L2-normalised embedding produced by `EmbeddingsPort.encode`. */
  vector: Float32Array;
  /** Snapshot of artwork metadata captured at ingest time. */
  metadata: ArtworkMetadata;
  /** Image provenance (`wikimedia` | `museum_api` | `manual`). */
  imageSource: ArtworkEmbedding['imageSource'];
  /** License classification of the catalog image. */
  license: ArtworkEmbedding['license'];
  /** Model version that produced the embedding (e.g. `"siglip-base-patch16-224@v1"`). */
  embeddingModelVersion: string;
  /**
   * Optional internal Musaium tenant FK (`museums.id`). Omitted / `null` means
   * the row belongs to the global public catalog (visible to every tenant);
   * a non-null value pins the row to that single tenant.
   *
   * Distinct from {@link ArtworkMetadata.museumQid} (Wikidata public reference).
   * OWASP LLM08 — see {@link FindNearestOptions.museumId}.
   */
  museumId?: number | null;
}

/** Optional tuning knobs for {@link ArtworkEmbeddingRepository.findNearest}. */
export interface FindNearestOptions {
  /**
   * Optional list of museum **Wikidata QIDs** to restrict the search to.
   * Implementations MUST translate this into an indexed predicate on
   * `museum_qid` so the HNSW pre-filter remains cheap.
   *
   * Note: this is the **external public** axis (Wikidata Q-identifiers shared
   * across all tenants — Q19675 = "Louvre" for every caller). For tenant
   * isolation use {@link museumId} below.
   */
  museumQids?: string[];

  /**
   * Optional **internal tenant** scope (`museums.id`). When provided, the
   * repository MUST filter rows to `museum_id IS NULL OR museum_id =
   * $museumId` — i.e. global public catalog rows PLUS that single tenant's
   * private rows. Other tenants' private rows MUST NEVER be returned.
   *
   * When omitted (undefined), implementations SHOULD warn-log and fall back
   * to the **global** read (NULL + every tenant) for V1 single-tenant
   * backward compatibility. The B2B onboarding checklist must flip every
   * caller to pass an explicit `museumId` before the first paying tenant
   * goes live (OWASP LLM08).
   */
  museumId?: number | null;
}

/**
 * Outcome of a batch upsert. Returned counts let the ingest CLI surface
 * idempotent reruns (`updated` + `skipped` dominate on the second run).
 */
export interface UpsertBatchResult {
  /** Rows that did not previously exist (by QID). */
  inserted: number;
  /** Rows that existed and were updated (different vector / metadata / model version). */
  updated: number;
  /** Rows that existed and were left untouched (same vector + same model version). */
  skipped: number;
}

/**
 * Repository port for the visual-similarity catalog. All methods MUST be
 * safe to call from concurrent requests — implementations rely on Postgres
 * transactional semantics, not in-process locks.
 */
export interface ArtworkEmbeddingRepository {
  /**
   * Returns the `topN` closest catalog rows to the query embedding, ordered
   * by ascending inner-product distance (closest first). The `visualScore`
   * on each result is already mapped into `[0, 1]`.
   *
   * @param query - L2-normalised query vector. Length must match `EMBEDDINGS_DIM`.
   * @param topN  - Maximum number of neighbours to return (positive integer).
   * @param opts  - Optional pre-filters (e.g. museum scope).
   * @returns Up to `topN` neighbours; empty when the catalog is empty or
   *          when no row satisfies the optional filters.
   */
  findNearest(
    query: Float32Array,
    topN: number,
    opts?: FindNearestOptions,
  ): Promise<NearestResult[]>;

  /**
   * Idempotent batch upsert keyed by `qid`. Implementations SHOULD wrap the
   * batch in a single transaction so a partial crash does not leave the
   * catalog half-ingested.
   *
   * @param rows - Rows to insert or update.
   * @returns Aggregate counts (see {@link UpsertBatchResult}).
   */
  upsertBatch(rows: ArtworkEmbeddingRow[]): Promise<UpsertBatchResult>;

  /**
   * Looks up a catalog row by Wikidata QID.
   *
   * @param qid - Wikidata QID (e.g. `"Q12418"`).
   * @returns The hydrated entity, or `null` when no row matches.
   */
  findByQid(qid: string): Promise<ArtworkEmbedding | null>;

  /**
   * Returns the total number of rows in the catalog. Used by the
   * `artwork_embeddings_count` Grafana gauge (see design §10).
   */
  count(): Promise<number>;
}
