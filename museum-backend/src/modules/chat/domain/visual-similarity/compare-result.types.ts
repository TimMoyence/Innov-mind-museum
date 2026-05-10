/**
 * Domain types for the visual-similarity / compare pipeline.
 *
 * These shapes are the contract between:
 *   - the embeddings + repository ports (low-level neighbour lookup),
 *   - the orchestration use case (`compareImageUseCase`),
 *   - and the HTTP adapter (`POST /chat/compare`).
 *
 * They are intentionally local to `domain/visual-similarity/` and do NOT live
 * in `chat.types.ts` — the visual-similarity vertical is owned end-to-end by
 * this folder. `ArtworkFacts` is re-imported from the existing knowledge-base
 * port (single source of truth for Wikidata-shaped facts; see C2 work).
 */

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/**
 * Why no useful match could be returned. Kept as a string-literal union (not
 * a TS `enum`) so it serialises 1:1 over JSON / OpenAPI without any runtime
 * mapping layer.
 *
 * - `no_visual_neighbor` — vector search returned no candidate above the
 *   visual-similarity floor (`VISUAL_FALLBACK_VISUAL_THRESHOLD`).
 *   Per UFR-013 we surface an empty list rather than fabricate matches.
 * - `encoder_unavailable` — `EmbeddingsPort.encode` failed (model not loaded,
 *   timeout, AVX2 missing, etc.). Mapped to HTTP 503 upstream.
 * - `quota_exceeded` — placeholder for the V2 paid-tier quota gate (R9).
 *   Wired now so adapters emitting it do not break the contract later.
 */
export type FallbackReason = 'no_visual_neighbor' | 'encoder_unavailable' | 'quota_exceeded';

/**
 * Subset of artwork metadata persisted alongside an embedding row.
 *
 * Kept narrower than {@link ArtworkFacts} on purpose: this is what the
 * catalog ingester records at write time (no Wikidata join). The richer,
 * language-aware {@link ArtworkFacts} is hydrated lazily by the Wikidata
 * enricher on the read path.
 */
export interface ArtworkMetadata {
  /** Canonical title at ingestion time (typically EN). */
  title: string;
  /** Creator name, when resolvable. */
  artist?: string;
  /** Creation date or period (free text — Wikidata P571 raw). */
  date?: string;
  /** Wikidata QID of the holding museum (`museum_qid` column). */
  museumQid?: string;
  /** Material / technique (Wikidata P186), free text. */
  technique?: string;
  /** Art movement (Wikidata P135), free text. */
  movement?: string;
  /** Genre (Wikidata P136), free text. */
  genre?: string;
  /** Direct image URL backing the embedding (CDN-friendly). */
  imageUrl: string;
  /** Optional smaller thumbnail URL for the FE carousel. */
  thumbnailUrl?: string;
  /** Required attribution string for `cc-by-sa` images (RFC 3986 plain text). */
  attribution?: string;
}

/**
 * Raw output of the repository's nearest-neighbour search — one row per
 * candidate artwork. Scores are post-normalisation (`[0, 1]`, higher is
 * closer). Enrichment + final fusion happens later in the use case.
 */
export interface NearestResult {
  /** Wikidata QID of the candidate artwork. */
  qid: string;
  /**
   * Visual similarity score in `[0, 1]`. Computed from the pgvector inner
   * product (`1 - <#>`) — embeddings are L2-normalised at encode time so
   * this is equivalent to cosine similarity rescaled to `[0, 1]`.
   */
  visualScore: number;
  /** Metadata snapshot captured at catalog-ingestion time. */
  metadata: ArtworkMetadata;
  /** Model version that produced the embedding (audit + re-index trigger). */
  modelVersion: string;
}

/**
 * One match returned to the API consumer. Shape mirrors the OpenAPI
 * `CompareMatch` schema — keep both in sync when editing.
 */
export interface CompareMatch {
  /** Wikidata QID of the matched artwork. */
  qid: string;
  /** Display title (resolved language). */
  title: string;
  /** Direct image URL for the carousel. */
  imageUrl: string;
  /** Optional thumbnail URL (smaller variant) for list rendering. */
  thumbnailUrl?: string;
  /** Visual similarity score, `[0, 1]`. */
  visualScore: number;
  /**
   * Metadata bonus score, `[0, 1]`. Defaults to 0 when no metadata signal
   * is available on the input image (V1 behaviour — see design §9 D4).
   */
  metadataScore: number;
  /**
   * Fused final score = `w_visual * visualScore + w_meta * metadataScore`,
   * clipped to `[0, 1]`. Drives sort order and top-K truncation.
   */
  finalScore: number;
  /**
   * Templated, deterministic rationale shown next to the card.
   * See `rationale-templater.ts` (Phase 5) for the FR / EN templates —
   * no LLM is involved (UFR-013 / design §9 D5).
   */
  rationale: string;
  /**
   * Verified Wikidata facts (artist, date, technique, …) hydrated by the
   * Wikidata enricher. Re-uses the canonical {@link ArtworkFacts} shape.
   */
  facts: ArtworkFacts;
  /** RFC 3986 attribution string, only set for `cc-by-sa` matches. */
  attribution?: string;
}

/**
 * Top-level response of the compare pipeline. Returned 1:1 in the
 * `POST /chat/compare` 200 body.
 */
export interface CompareResult {
  /** Ordered top-K matches (best `finalScore` first). May be empty. */
  matches: CompareMatch[];
  /** Total wall-clock duration of the compare pipeline, milliseconds. */
  durationMs: number;
  /** Model version used to encode the input image (mirrors `NearestResult.modelVersion`). */
  modelVersion: string;
  /**
   * Set when `matches` is empty or degraded. Absent on the happy path.
   * See {@link FallbackReason}.
   */
  fallbackReason?: FallbackReason;
}
