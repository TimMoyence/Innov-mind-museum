export type ChatRole = 'user' | 'assistant' | 'system';
export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert';

export interface VisitedArtwork {
  title: string;
  artist?: string;
  room?: string;
  messageId: string;
  discussedAt: string;
}

export interface VisitContext {
  museumName?: string;
  museumConfidence: number;
  artworksDiscussed: VisitedArtwork[];
  roomsVisited: string[];
  detectedExpertise: ExpertiseLevel;
  expertiseSignals: number;
  lastUpdated: string;
}

export interface CreateSessionInput {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
}

export interface ChatRequestContext {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
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

export type ChatSectionName = 'summary' | 'expertCompact';
export type ChatSectionStatus = 'success' | 'timeout' | 'error' | 'fallback';

export interface ChatAssistantDiagnostics {
  profile: 'single_section' | 'parallel_sections';
  degraded: boolean;
  totalLatencyMs: number;
  sections: Array<{
    name: ChatSectionName;
    status: ChatSectionStatus;
    attempts: number;
    latencyMs: number;
    timeoutMs: number;
    payloadBytes: number;
    error?: string;
  }>;
}

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
  citations?: string[];
  diagnostics?: ChatAssistantDiagnostics;
}
