import { z } from 'zod';

import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';

export type { ContentPreference };

/**
 * Tagged source identifier for an enriched image.
 *
 * - `wikidata`: P18 image URL from Wikidata SPARQL.
 * - `unsplash`: external Unsplash search result.
 * - `commons`: Wikimedia Commons search result (C2 v2).
 * - `musaium`: internal curated catalogue match (C2 v2).
 *
 * Source-priority on duplicate-URL dedup is `musaium > wikidata > commons > unsplash`
 * — see `image-enrichment.service.sortAndDedup`.
 */
export type EnrichedImageSource = 'wikidata' | 'unsplash' | 'commons' | 'musaium';

/**
 * An image enriched from external sources (Wikidata, Unsplash, Commons, Musaium).
 *
 * v2 (C2 enrichment) adds `rationale` (LLM-authored explanation) to every
 * EnrichedImage. Pre-v2 cached metadata may not include it; readers SHOULD
 * fall back to an i18n string when missing.
 */
export interface EnrichedImage {
  url: string;
  thumbnailUrl: string;
  caption: string;
  /**
   * LLM-authored rationale shown under the thumb in the carousel.
   * v2 (C2 finition 2026-05) — REQUIRED for new responses; absent for
   * pre-v2 cached messages (FE falls back to `chat.enrichment.rationale_fallback`).
   */
  rationale: string;
  source: EnrichedImageSource;
  score: number;
  attribution?: string;
}

/** Role of a message within a chat session. */
export type ChatRole = 'user' | 'assistant' | 'system';

/** Allowed intent values for a chat session — single source of truth for the type + Zod enum. */
export const CHAT_SESSION_INTENTS = ['default', 'walk'] as const;
/** Intent of a chat session — drives prompt strategy and UX flow. */
export type ChatSessionIntent = (typeof CHAT_SESSION_INTENTS)[number];

/** Reason a user may report a message. */
export type ReportReason = 'offensive' | 'inaccurate' | 'inappropriate' | 'other';

/** Visitor expertise level, used to adapt response depth. */
export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert';

/** An artwork that was discussed during a museum visit session. */
export interface VisitedArtwork {
  title: string;
  artist?: string;
  room?: string;
  /** ID of the message where this artwork was discussed. */
  messageId: string;
  /** ISO-8601 timestamp of when the artwork was discussed. */
  discussedAt: string;
}

/** Accumulated context about a museum visit across a chat session. */
export interface VisitContext {
  museumName?: string;
  museumAddress?: string;
  /**
   * Short history/presentation of the museum (seeded from Museum.description at
   * session creation). Used by the LLM to spontaneously introduce the museum
   * during the greeting phase — the "visit starts before you walk in" promise.
   */
  museumDescription?: string;
  /** Confidence score (0-1) that the detected museum name is correct. */
  museumConfidence: number;
  artworksDiscussed: VisitedArtwork[];
  roomsVisited: string[];
  detectedExpertise: ExpertiseLevel;
  /** Running count of signals used to determine expertise level. */
  expertiseSignals: number;
  /** ISO-8601 timestamp of the last context update. */
  lastUpdated: string;
  /** Nearby museums resolved from coordinates at session creation. */
  nearbyMuseums?: { name: string; distance: number }[];
}

/** Parameters for creating a new chat session. */
export interface CreateSessionInput {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
  museumId?: number;
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
  /** Pre-seeded visit context (set by ChatSessionService when resolving museum info). */
  visitContext?: VisitContext;
  intent?: ChatSessionIntent;
}

/** Client-provided context attached to each chat message request. */
interface ChatRequestContext {
  /** Free-text location hint (e.g. museum name or room). */
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
  /** Frontend pre-classification hint: when 'art', the backend skips the LLM art-topic classifier. */
  preClassified?: 'art';
  /** When true, the LLM prompt includes accessibility-oriented audio description instructions. */
  audioDescriptionMode?: boolean;
  /** When true, generate a shorter response for low-bandwidth connections. */
  lowDataMode?: boolean;
  /**
   * User's content preferences — which aspects of an artwork they prefer to learn about.
   * Sent by the frontend (cached from /me) so the backend avoids an extra user lookup per message.
   * The DB (via `UpdateContentPreferencesUseCase` + `/me`) remains the source of truth.
   */
  contentPreferences?: ContentPreference[];
}

/** Payload for posting a text or image message to a chat session. */
export interface PostMessageInput {
  text?: string;
  image?: {
    source: 'base64' | 'url' | 'upload';
    value: string;
    mimeType?: string;
    sizeBytes?: number;
  };
  context?: ChatRequestContext;
}

/** Payload for posting an audio message to a chat session. */
export interface PostAudioMessageInput {
  audio: {
    base64: string;
    mimeType: string;
    sizeBytes: number;
  };
  context?: ChatRequestContext;
}

/** Cursor-based pagination query for session messages. */
export interface MessagePageQuery {
  cursor?: string;
  limit?: number;
}

/** Identifier for a named LLM prompt section. */
export type LlmSectionName = 'summary';

/** Outcome status of a single LLM section execution. */
type ChatSectionStatus = 'success' | 'timeout' | 'error' | 'fallback';

/** Diagnostics for an assistant response, detailing per-section LLM performance. */
export interface ChatAssistantDiagnostics {
  profile: 'single_section';
  /** Whether any section fell back to a degraded response. */
  degraded: boolean;
  totalLatencyMs: number;
  sections: {
    name: LlmSectionName;
    status: ChatSectionStatus;
    attempts: number;
    latencyMs: number;
    timeoutMs: number;
    payloadBytes: number;
    error?: string;
  }[];
}

/**
 * v2 LLM-suggested image search-query entry attached to an assistant response.
 *
 * v1 had `{query, description}`. v2 (C2 finition 2026-05) adds REQUIRED
 * `rationale` (1-sentence why-this-image) and `caption` (≤8-word title)
 * authored by the LLM. The aggregator (`enrichment-fetcher.fetchImages`) fans
 * out one source-client search per `query`, then propagates `rationale +
 * caption` into the resulting `EnrichedImage` for FE rendering.
 *
 * Cap: at most 4 entries per response (defence-in-depth on top of LLM prompt
 * cap; enforced in `assistant-response.toSuggestedImages`).
 */
export interface SuggestedImage {
  query: string;
  description: string;
  /** LLM-authored 1-sentence explanation rendered under the carousel thumb. */
  rationale: string;
  /** LLM-authored ≤8-word title used as caption when source is non-Unsplash. */
  caption: string;
}

/**
 * Provenance of a citation source surfaced to the user (C4 citations v2).
 *
 * - `wikidata`: SPARQL-resolved Wikidata entity (P18 image, P1476 label, etc.).
 * - `web`: Brave/Tavily/SearXNG WebSearch fallback result.
 * - `museum-catalog`: internal Musaium curated catalogue entry.
 * - `commons`: Wikimedia Commons file or category.
 *
 * The four-value enum is the V1 source provenance whitelist; any other value
 * is a schema-invalid entry and MUST be dropped by `CitationSourceSchema`.
 */
export type CitationSourceType = 'wikidata' | 'web' | 'museum-catalog' | 'commons';

/**
 * A user-verifiable citation source attached to a factual assistant response.
 *
 * Shape decided in design D2 (`design.md#9`). `quote` is the architectural
 * prevention lever — a verbatim NFKC-normalized substring of a fact block fed
 * to the LLM, validated post-LLM via `sources-validator`. Replaces the legacy
 * `citations: string[]` field, which coexists for one release cycle (NFR8).
 *
 * `quote.length ∈ [10, 500]` avoids trivial-match false positives at the
 * lower bound and pathological output sizes at the upper bound (NG2).
 */
export interface CitationSource {
  url: string;
  type: CitationSourceType;
  title: string;
  /** Verbatim NFKC-normalized substring of a fact block fed to the LLM. */
  quote: string;
  /** Optional judge-derived confidence (0..1) — may be absent for KB-direct sources. */
  confidence?: number;
}

/**
 * Zod runtime validator for `CitationSource`.
 *
 * Used by `assistant-response.ts` parser to silently drop malformed entries
 * via `safeParse` (R2). Schema mirrors the TS interface; field constraints:
 * - `url`: must parse as a URL (Zod `.url()`).
 * - `type`: closed enum `'wikidata'|'web'|'museum-catalog'|'commons'`.
 * - `title`: non-empty, ≤ 300 chars (display safeguard).
 * - `quote`: 10..500 chars (clamp anti-FP / anti-bloat, NG2 + token budget).
 * - `confidence`: optional `number` in [0, 1].
 */
export const CitationSourceSchema = z.object({
  url: z.url(),
  type: z.enum(['wikidata', 'web', 'museum-catalog', 'commons']),
  title: z.string().min(1).max(300),
  quote: z.string().min(10).max(500),
  confidence: z.number().min(0).max(1).optional(),
});

/** Structured metadata extracted from an assistant response by the LLM pipeline. */
export interface ChatAssistantMetadata {
  /** Artwork identified from user image or text. */
  detectedArtwork?: {
    artworkId?: string;
    title?: string;
    artist?: string;
    confidence?: number;
    source?: string;
    museum?: string;
    room?: string;
  };
  recommendations?: string[];
  expertiseSignal?: ExpertiseLevel;
  /**
   * Legacy citations (string[]) — superseded by `sources` (Citations v2, C4).
   * Kept for one release cycle (NFR8) so legacy clients/cached messages keep
   * parsing. Formal `@deprecated` marker + `console.warn` will land in V1.1;
   * removal target V1.2. Do NOT add the `@deprecated` tag now — it would
   * break the BE lint baseline on the existing `assistant-response.ts`
   * consumer that still writes this field at T2.2.
   */
  citations?: string[];
  /**
   * Citations v2 — user-verifiable sources with verbatim `quote` post-validated
   * by the `sources-validator` use-case (R1/R4). Renders as inline `[n]`
   * superscript + bottom-sheet preview on mobile (R12).
   */
  sources?: CitationSource[];
  deeperContext?: string;
  openQuestion?: string;
  followUpQuestions?: string[];
  imageDescription?: string;
  /** Enriched images fetched from external sources (Wikidata, Unsplash, Commons, Musaium). */
  images?: EnrichedImage[];
  /**
   * LLM-suggested image search queries for post-streaming enrichment.
   *
   * v2 (C2 finition 2026-05) — `rationale` and `caption` are REQUIRED for new
   * entries. Legacy v1 entries (`{query, description}` only) are tolerated by
   * `assistant-response.toSuggestedImages` which fills `rationale` with the
   * fallback marker and `caption` with `description` for backward compatibility.
   */
  suggestedImages?: SuggestedImage[];
  diagnostics?: ChatAssistantDiagnostics;
}
