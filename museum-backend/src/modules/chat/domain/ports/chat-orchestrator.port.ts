import type {
  ChatAssistantMetadata,
  ChatSessionIntent,
  ContentPreference,
  VisitContext,
} from '@modules/chat/domain/chat.types';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ResolvedLocation } from '@modules/chat/useCase/location/location-resolver';

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
  /**
   * Authenticated user id of the requester. Used by the cache layer to
   * scope user-specific entries (STRIDE I1 / R1 remediation). Null/absent
   * disables user-scoped caching for this turn.
   */
  userId?: number | null;
  /** Resolved geolocation context from per-message GPS coordinates. */
  resolvedLocation?: ResolvedLocation;
  /**
   * User's content preferences — which aspects of an artwork they want emphasized
   * (history, technique, artist). Read-only hint for the LLM; does not filter content.
   */
  contentPreferences?: readonly ContentPreference[];
  /**
   * Session-level intent that controls which orchestration path is used.
   * When 'walk', injects WALK_TOUR_GUIDE_SECTION and uses structured output
   * to return up to 3 next-artwork suggestions alongside the answer.
   */
  intent?: ChatSessionIntent;
}

/** Result returned by {@link ChatOrchestrator.generate}. */
export interface OrchestratorOutput {
  /** LLM-generated response text. */
  text: string;
  /** Structured metadata extracted from the LLM response (citations, diagnostics, etc.). */
  metadata: ChatAssistantMetadata;
  /**
   * Next-artwork suggestions returned only when intent='walk'. Up to 3 short strings
   * (each ≤60 chars), validated by walkAssistantOutputSchema before being set here.
   * Undefined for all other intents.
   */
  suggestions?: string[];
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
