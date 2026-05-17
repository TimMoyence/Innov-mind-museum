import type {
  ChatAssistantMetadata,
  ChatSessionIntent,
  ContentPreference,
  VisitContext,
} from '@modules/chat/domain/chat.types';
import type { ResolvedLocation } from '@modules/chat/domain/location/resolvedLocation';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { KnowledgeRouterSource } from '@modules/chat/useCase/knowledge/knowledge-router.service';

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
  /** Pre-verified from extraction DB (highest priority enrichment). */
  localKnowledgeBlock?: string;
  audioDescriptionMode?: boolean;
  lowDataMode?: boolean;
  /** For cache key scoping. */
  museumId?: number | null;
  /**
   * Cache user-scope key (STRIDE I1 / R1). Null/absent disables user-scoped
   * caching for this turn.
   */
  userId?: number | null;
  resolvedLocation?: ResolvedLocation;
  /** Read-only hint for the LLM; does not filter content. */
  contentPreferences?: readonly ContentPreference[];
  /**
   * When 'walk', injects WALK_TOUR_GUIDE_SECTION and uses structured output to
   * return up to 3 next-artwork suggestions alongside the answer.
   */
  intent?: ChatSessionIntent;
  /**
   * C4.1 (T3.5) — Verified facts produced by `KnowledgeRouter.resolve()`
   * upstream in `PrepareMessagePipeline`. Threaded into `buildSectionMessages`
   * by every orchestrator entry point. Spotlighting datamarking envelope (T2.3)
   * wraps these as SECOND SystemMessage. Empty/undefined → envelope NOT emitted.
   */
  facts?: readonly string[];
  /**
   * C4.1 (T3.5) — Propagated from `KnowledgeRouterResult.source`. `'none'`
   * short-circuits the envelope even if `facts` is non-empty.
   */
  factsSource?: KnowledgeRouterSource;
}

export interface OrchestratorOutput {
  text: string;
  metadata: ChatAssistantMetadata;
  /**
   * Returned only when intent='walk'. Up to 3 strings (each ≤60 chars),
   * validated by walkAssistantOutputSchema. Undefined for other intents.
   */
  suggestions?: string[];
}

export interface ChatOrchestrator {
  generate(input: OrchestratorInput): Promise<OrchestratorOutput>;
  /** Calls onChunk for each text token. Returns final output when complete. */
  generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput>;
}
