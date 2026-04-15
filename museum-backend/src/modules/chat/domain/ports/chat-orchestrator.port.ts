import type { ResolvedLocation } from '../../useCase/location-resolver';
import type { ChatAssistantMetadata, VisitContext } from '../chat.types';
import type { ChatMessage } from '../chatMessage.entity';

/** Input for the LLM orchestrator. */
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
  /** Pre-verified local knowledge block from the extraction DB (highest priority enrichment). */
  localKnowledgeBlock?: string;
  /** When true, prompts include accessibility-oriented audio description instructions. */
  audioDescriptionMode?: boolean;
  /** When true, generate a shorter response (low-data mode). */
  lowDataMode?: boolean;
  /** Session-level museum ID, used for cache key scoping. */
  museumId?: number | null;
  /** Resolved geolocation context from per-message GPS coordinates. */
  resolvedLocation?: ResolvedLocation;
}

/** Result returned by {@link ChatOrchestrator.generate}. */
export interface OrchestratorOutput {
  /** LLM-generated response text. */
  text: string;
  /** Structured metadata extracted from the LLM response (citations, diagnostics, etc.). */
  metadata: ChatAssistantMetadata;
}

/** Port for LLM orchestration -- generates assistant responses from conversation context. */
export interface ChatOrchestrator {
  /** Generates an assistant response for the given input. */
  generate(input: OrchestratorInput): Promise<OrchestratorOutput>;
  /** Generates a streaming assistant response, calling onChunk for each text token. Returns final output when complete. */
  generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput>;
}
