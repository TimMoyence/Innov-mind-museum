import { z } from 'zod';

import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';

export type { ContentPreference };

/**
 * Source-priority on duplicate-URL dedup: `musaium > wikidata > commons > unsplash`
 * — see `image-enrichment.service.sortAndDedup`.
 */
export type EnrichedImageSource = 'wikidata' | 'unsplash' | 'commons' | 'musaium';

/**
 * v2 (C2 enrichment) adds `rationale` (LLM-authored explanation) to every
 * EnrichedImage. Pre-v2 cached metadata may not include it; readers SHOULD
 * fall back to an i18n string when missing.
 */
export interface EnrichedImage {
  url: string;
  thumbnailUrl: string;
  caption: string;
  /**
   * v2 (C2 finition 2026-05) — REQUIRED for new responses; absent for
   * pre-v2 cached messages (FE falls back to `chat.enrichment.rationale_fallback`).
   */
  rationale: string;
  source: EnrichedImageSource;
  score: number;
  attribution?: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

/** Single source of truth for the type + Zod enum. */
export const CHAT_SESSION_INTENTS = ['default', 'walk'] as const;
export type ChatSessionIntent = (typeof CHAT_SESSION_INTENTS)[number];

export type ReportReason = 'offensive' | 'inaccurate' | 'inappropriate' | 'other';

export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert';

export interface VisitedArtwork {
  title: string;
  artist?: string;
  room?: string;
  messageId: string;
  /** ISO-8601. */
  discussedAt: string;
}

export interface VisitContext {
  museumName?: string;
  museumAddress?: string;
  /**
   * Seeded from Museum.description at session creation. Used by the LLM to
   * spontaneously introduce the museum during greeting — "visit starts before
   * you walk in".
   */
  museumDescription?: string;
  /** Confidence (0-1) that detected museum name is correct. */
  museumConfidence: number;
  artworksDiscussed: VisitedArtwork[];
  roomsVisited: string[];
  detectedExpertise: ExpertiseLevel;
  expertiseSignals: number;
  /** ISO-8601. */
  lastUpdated: string;
  nearbyMuseums?: { name: string; distance: number }[];
}

export interface CreateSessionInput {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
  museumId?: number;
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
  visitContext?: VisitContext;
  intent?: ChatSessionIntent;
}

interface ChatRequestContext {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
  /** When 'art', backend skips the LLM art-topic classifier. */
  preClassified?: 'art';
  audioDescriptionMode?: boolean;
  lowDataMode?: boolean;
  /**
   * Cached from /me to avoid an extra user lookup per message. DB (via
   * `UpdateContentPreferencesUseCase` + `/me`) remains source of truth.
   */
  contentPreferences?: ContentPreference[];
}

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

export interface PostAudioMessageInput {
  audio: {
    base64: string;
    mimeType: string;
    sizeBytes: number;
  };
  context?: ChatRequestContext;
}

export interface MessagePageQuery {
  cursor?: string;
  limit?: number;
}

export type LlmSectionName = 'summary';

type ChatSectionStatus = 'success' | 'timeout' | 'error' | 'fallback';

export interface ChatAssistantDiagnostics {
  profile: 'single_section';
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
 * v1 had `{query, description}`. v2 (C2 finition 2026-05) adds REQUIRED
 * `rationale` + `caption` authored by the LLM. The aggregator
 * (`enrichment-fetcher.fetchImages`) fans out one source-client search per
 * `query`, then propagates `rationale + caption` into the resulting
 * `EnrichedImage`.
 *
 * Cap: at most 4 entries per response — enforced in
 * `assistant-response.toSuggestedImages`.
 */
export interface SuggestedImage {
  query: string;
  description: string;
  rationale: string;
  /** ≤8-word title used as caption when source is non-Unsplash. */
  caption: string;
}

/**
 * Four-value V1 source provenance whitelist; any other value is schema-invalid
 * and MUST be dropped by `CitationSourceSchema`.
 */
export type CitationSourceType = 'wikidata' | 'web' | 'museum-catalog' | 'commons';

/**
 * Decided in design D2 (`design.md#9`). `quote` is the architectural prevention
 * lever — verbatim NFKC-normalized substring of a fact block fed to the LLM,
 * validated post-LLM via `sources-validator`. Replaces legacy `citations:
 * string[]`, which coexists for one release cycle (NFR8).
 *
 * `quote.length ∈ [10, 500]` avoids trivial-match false positives + pathological
 * output sizes (NG2).
 */
export interface CitationSource {
  url: string;
  type: CitationSourceType;
  title: string;
  /** Verbatim NFKC-normalized substring of a fact block fed to the LLM. */
  quote: string;
  /** Judge-derived confidence (0..1) — absent for KB-direct sources. */
  confidence?: number;
}

/**
 * Used by `assistant-response.ts` parser to silently drop malformed entries via
 * `safeParse` (R2). `quote` clamp 10..500 = anti-FP / anti-bloat (NG2 + token budget).
 */
export const CitationSourceSchema = z.object({
  url: z.url(),
  type: z.enum(['wikidata', 'web', 'museum-catalog', 'commons']),
  title: z.string().min(1).max(300),
  quote: z.string().min(10).max(500),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * A5 — Keep in EXACT lockstep with
 * `museum-frontend/features/chat/application/phases.ts`. Spec: A5.md §1.1 R7.
 */
export type ChatPipelinePhase =
  | 'analyzing-image'
  | 'searching-collection'
  | 'composing'
  | 'synthesizing-voice'
  | 'done';

export interface ChatAssistantMetadata {
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
   * Legacy citations — superseded by `sources` (Citations v2, C4). Kept one
   * release cycle (NFR8) so legacy clients/cached messages keep parsing.
   * Formal `@deprecated` lands V1.1; removal V1.2. Do NOT add `@deprecated`
   * now — breaks BE lint baseline on `assistant-response.ts` consumer (T2.2).
   */
  citations?: string[];
  /**
   * Citations v2 — verbatim `quote` post-validated by `sources-validator`
   * use-case (R1/R4). Renders as inline `[n]` superscript + bottom-sheet
   * preview on mobile (R12).
   */
  sources?: CitationSource[];
  deeperContext?: string;
  openQuestion?: string;
  /**
   * B3 — Single factual-anchor follow-up (≤80 chars). Singular by design —
   * replaces legacy `followUpQuestions: string[]` (deleted same commit per
   * doctrine `feedback_bury_dead_code`, B3 dispatcher override Q4).
   * See `docs/chat-ux-refonte/specs/B3.md` §0.7 / R7 / NFR13.
   */
  suggestedFollowUp?: string;
  imageDescription?: string;
  images?: EnrichedImage[];
  /**
   * v2 (C2 finition 2026-05) — `rationale` + `caption` REQUIRED for new entries.
   * Legacy v1 entries (`{query, description}`) tolerated by
   * `assistant-response.toSuggestedImages` which fills fallback markers.
   */
  suggestedImages?: SuggestedImage[];
  diagnostics?: ChatAssistantDiagnostics;
  /**
   * A5 — `'done'` on success, last attempted phase otherwise. Backward-compat
   * optional (NFR8 — legacy persisted messages have no value). FE treats
   * absence as silence. See `docs/chat-ux-refonte/specs/A5.md` §1.1 R1/R8.
   */
  phase?: ChatPipelinePhase;
}
