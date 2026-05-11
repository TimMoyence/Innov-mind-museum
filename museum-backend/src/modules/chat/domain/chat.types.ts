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
  citations?: string[];
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
