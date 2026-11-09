import { z } from 'zod';

import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';

export type { ContentPreference };

export type EnrichedImageSource = 'wikidata' | 'unsplash' | 'commons' | 'musaium';

export interface EnrichedImage {
  url: string;
  thumbnailUrl: string;
  caption: string;
  rationale: string;
  source: EnrichedImageSource;
  score: number;
  attribution?: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export const CHAT_SESSION_INTENTS = ['default', 'walk'] as const;
export type ChatSessionIntent = (typeof CHAT_SESSION_INTENTS)[number];

export type ReportReason = 'offensive' | 'inaccurate' | 'inappropriate' | 'other';

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
  museumAddress?: string;
  museumDescription?: string;
  museumConfidence: number;
  artworksDiscussed: VisitedArtwork[];
  roomsVisited: string[];
  detectedExpertise: ExpertiseLevel;
  expertiseSignals: number;
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
  preClassified?: 'art';
  audioDescriptionMode?: boolean;
  voiceMode?: boolean;
  lowDataMode?: boolean;
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

export interface SuggestedImage {
  query: string;
  description: string;
  rationale: string;
  caption: string;
}

export type CitationSourceType = 'wikidata' | 'web' | 'museum-catalog' | 'commons';

export interface CitationSource {
  url: string;
  type: CitationSourceType;
  title: string;
  quote: string;
  confidence?: number;
}

export const CitationSourceSchema = z.object({
  url: z.url(),
  type: z.enum(['wikidata', 'web', 'museum-catalog', 'commons']),
  title: z.string().min(1).max(300),
  quote: z.string().min(10).max(500),
  confidence: z.number().min(0).max(1).optional(),
});

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
  citations?: string[];
  sources?: CitationSource[];
  deeperContext?: string;
  openQuestion?: string;
  imageDescription?: string;
  images?: EnrichedImage[];
  suggestedImages?: SuggestedImage[];
  diagnostics?: ChatAssistantDiagnostics;
  phase?: ChatPipelinePhase;
}
