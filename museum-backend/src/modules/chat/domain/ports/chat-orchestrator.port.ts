import type {
  ChatAssistantMetadata,
  ChatSessionIntent,
  ContentPreference,
  VisitContext,
} from '@modules/chat/domain/chat.types';
import type { KnowledgeRouterSource } from '@modules/chat/domain/knowledge/knowledge-router.types';
import type { ResolvedLocation } from '@modules/chat/domain/location/resolvedLocation';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';

export interface OrchestratorInput {
  history: ChatMessage[];
  text?: string;
  image?: {
    source: 'base64' | 'url' | 'upload';
    value: string;
    mimeType?: string;
  };
  locale?: string;
  museumMode: boolean;
  context?: {
    location?: string;
    guideLevel?: 'beginner' | 'intermediate' | 'expert';
  };
  visitContext?: VisitContext | null;
  requestId?: string;
  userMemoryBlock?: string;
  knowledgeBaseBlock?: string;
  webSearchBlock?: string;
  localKnowledgeBlock?: string;
  audioDescriptionMode?: boolean;
  voiceMode?: boolean;
  lowDataMode?: boolean;
  museumId?: number | null;
  userId?: number | null;
  sessionId?: string;
  resolvedLocation?: ResolvedLocation;
  contentPreferences?: readonly ContentPreference[];
  intent?: ChatSessionIntent;
  facts?: readonly string[];
  factsSource?: KnowledgeRouterSource;
  currentArtwork?: {
    readonly title: string;
    readonly roomId: string | null;
  } | null;
}

export interface OrchestratorOutput {
  text: string;
  metadata: ChatAssistantMetadata;
  degraded: boolean;
  suggestions?: string[];
}

export interface ChatOrchestrator {
  generate(input: OrchestratorInput): Promise<OrchestratorOutput>;
}
