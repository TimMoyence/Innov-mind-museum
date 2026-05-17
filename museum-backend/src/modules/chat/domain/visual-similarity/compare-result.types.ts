/**
 * Domain types for the visual-similarity / compare pipeline — contract between
 * the embeddings + repository ports, the `compareImageUseCase`, and the
 * `POST /chat/compare` adapter. Local to `domain/visual-similarity/` (the
 * vertical is owned end-to-end here). `ArtworkFacts` re-imported from
 * knowledge-base port (single source of truth for Wikidata facts — C2).
 */

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/**
 * String-literal union (not `enum`) so it serialises 1:1 over JSON/OpenAPI.
 *
 * - `no_visual_neighbor` — vector search returned no candidate above
 *   `VISUAL_FALLBACK_VISUAL_THRESHOLD`. Per UFR-013 empty list, not fabricated.
 * - `encoder_unavailable` — `EmbeddingsPort.encode` failed. Mapped to HTTP 503.
 * - `quota_exceeded` — placeholder for V2 paid-tier quota gate (R9). Wired now
 *   so adapters don't break the contract later.
 */
export type FallbackReason = 'no_visual_neighbor' | 'encoder_unavailable' | 'quota_exceeded';

/**
 * Narrower than {@link ArtworkFacts}: what the catalog ingester records at
 * write time (no Wikidata join). The richer language-aware {@link ArtworkFacts}
 * is hydrated lazily by the Wikidata enricher on the read path.
 */
export interface ArtworkMetadata {
  /** Canonical title at ingestion (typically EN). */
  title: string;
  artist?: string;
  /** Wikidata P571 raw free text. */
  date?: string;
  /** Wikidata QID of holding museum (`museum_qid` column). */
  museumQid?: string;
  /** Wikidata P186 free text. */
  technique?: string;
  /** Wikidata P135 free text. */
  movement?: string;
  /** Wikidata P136 free text. */
  genre?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  /** Required for `cc-by-sa`. RFC 3986 plain text. */
  attribution?: string;
}

/** Scores post-normalisation `[0, 1]`, higher = closer. Enrichment + fusion later. */
export interface NearestResult {
  qid: string;
  /**
   * `[0, 1]` from pgvector inner product (`1 - <#>`). Embeddings are
   * L2-normalised at encode time so this is cosine rescaled to `[0, 1]`.
   */
  visualScore: number;
  metadata: ArtworkMetadata;
  /** Audit + re-index trigger. */
  modelVersion: string;
}

/** Mirrors OpenAPI `CompareMatch` schema — keep both in sync. */
export interface CompareMatch {
  qid: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string;
  /** `[0, 1]`. */
  visualScore: number;
  /** `[0, 1]`. Defaults 0 when no metadata signal on input image (V1 — design §9 D4). */
  metadataScore: number;
  /**
   * `w_visual * visualScore + w_meta * metadataScore`, clipped to `[0, 1]`.
   * Drives sort order + top-K truncation.
   */
  finalScore: number;
  /**
   * Templated deterministic rationale (no LLM, UFR-013 / design §9 D5). See
   * `rationale-templater.ts` (Phase 5) for FR/EN templates.
   */
  rationale: string;
  facts: ArtworkFacts;
  /** Only set for `cc-by-sa`. RFC 3986. */
  attribution?: string;
}

/** Returned 1:1 in `POST /chat/compare` 200 body. */
export interface CompareResult {
  /** Ordered best `finalScore` first. May be empty. */
  matches: CompareMatch[];
  durationMs: number;
  /** Mirrors `NearestResult.modelVersion`. */
  modelVersion: string;
  /** Set when `matches` empty or degraded. Absent on happy path. */
  fallbackReason?: FallbackReason;
}
