/** Role of a message within a chat session. */
export type ChatRole = 'user' | 'assistant' | 'system';

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
  /** Confidence score (0-1) that the detected museum name is correct. */
  museumConfidence: number;
  artworksDiscussed: VisitedArtwork[];
  roomsVisited: string[];
  detectedExpertise: ExpertiseLevel;
  /** Running count of signals used to determine expertise level. */
  expertiseSignals: number;
  /** ISO-8601 timestamp of the last context update. */
  lastUpdated: string;
}

/** Parameters for creating a new chat session. */
export interface CreateSessionInput {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
  museumId?: number;
}

/** Client-provided context attached to each chat message request. */
export interface ChatRequestContext {
  /** Free-text location hint (e.g. museum name or room). */
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
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

/** Name of an LLM response section in the chat pipeline. */
export type ChatSectionName = 'summary';

/** Outcome status of a single LLM section execution. */
export type ChatSectionStatus = 'success' | 'timeout' | 'error' | 'fallback';

/** Diagnostics for an assistant response, detailing per-section LLM performance. */
export interface ChatAssistantDiagnostics {
  profile: 'single_section';
  /** Whether any section fell back to a degraded response. */
  degraded: boolean;
  totalLatencyMs: number;
  sections: {
    name: ChatSectionName;
    status: ChatSectionStatus;
    attempts: number;
    latencyMs: number;
    timeoutMs: number;
    payloadBytes: number;
    error?: string;
  }[];
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
  diagnostics?: ChatAssistantDiagnostics;
}
