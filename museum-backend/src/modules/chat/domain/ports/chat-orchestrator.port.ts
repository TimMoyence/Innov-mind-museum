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
  /** Pre-verified from extraction DB (highest priority enrichment). */
  localKnowledgeBlock?: string;
  audioDescriptionMode?: boolean;
  /**
   * C9.10 (2026-05-17) — Voice-first walk-mode prompt branch. When `true`,
   * `buildSummaryPrompt` constrains the answer to 60-80 words prose-only.
   */
  voiceMode?: boolean;
  lowDataMode?: boolean;
  /** For cache key scoping. */
  museumId?: number | null;
  /**
   * Cache user-scope key (STRIDE I1 / R1). Null/absent disables user-scoped
   * caching for this turn.
   */
  userId?: number | null;
  /**
   * Chat session id (string UUID). Propagated to Langfuse `trace.sessionId`
   * by `withLangfuseTrace` (C9.0). Undefined => trace has no sessionId — no
   * fabrication (C9.0 spec R7).
   */
  sessionId?: string;
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
  /**
   * W3 (T5.4) — Resolved from `chatSession.currentArtworkId` upstream of the
   * orchestrator (pipeline performs the `artwork_knowledge` lookup). When
   * present, `buildSystemPrompt` injects a `[CURRENT ARTWORK]` section
   * BEFORE the `[END OF SYSTEM INSTRUCTIONS]` boundary marker. Title MUST
   * have passed through `sanitizePromptInput()` before reaching here (R22 +
   * design.md §7 security review).
   */
  currentArtwork?: {
    /** Pre-sanitised title (≤500 chars after `sanitizePromptInput`). */
    readonly title: string;
    /** UUID v4 — pre-validated by the FE parser + BE Zod schema. */
    readonly roomId: string | null;
  } | null;
}

export interface OrchestratorOutput {
  text: string;
  metadata: ChatAssistantMetadata;
  /**
   * Returned only when intent='walk'. Up to 3 strings (each ≤60 chars),
   * validated by walkAssistantOutputSchema. Undefined for other intents.
   */
  suggestions?: string[];
  /**
   * INC-2026-07-14 — `true` when the LLM failed and `text` is the canned
   * `createSummaryFallback` template rather than a model answer.
   *
   * This MUST live on the output itself and NOT inside
   * `metadata.diagnostics.degraded`: `metadata.diagnostics` is attached only when
   * `env.llm.includeDiagnostics` is true, and that flag is hard-coded to `false`
   * outside development (`env.ts:194-195`, deliberately — it stops a NODE_ENV typo
   * from leaking prompt fragments). Reading the signal from there would therefore
   * be GREEN in tests and INERT in production — a guard that guards nothing.
   *
   * The one consumer that must honour it is the LLM response cache
   * (`ChatMessageService.tryLlmCacheStore`): caching a fallback pins the outage in
   * Redis for up to `TTL_GENERIC_S` (7 days), so the product stays broken for every
   * already-asked question long after the root cause is fixed.
   *
   * Optional on the port (test fakes and the non-section paths may omit it); the
   * real adapter (`assembleResponse`) always sets it. `undefined` is treated as
   * "not degraded" — a cache write, i.e. the pre-existing behaviour.
   */
  degraded?: boolean;
}

export interface ChatOrchestrator {
  generate(input: OrchestratorInput): Promise<OrchestratorOutput>;
}
