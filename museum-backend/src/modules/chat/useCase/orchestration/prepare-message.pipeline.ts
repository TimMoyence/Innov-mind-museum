import { fetchEnrichmentData } from '@modules/chat/useCase/enrichment/enrichment-fetcher';
import { evaluateUserInputGuardrail } from '@modules/chat/useCase/guardrail/art-topic-guardrail';
import { resolveLocationForMessage } from '@modules/chat/useCase/location/location-resolver';
import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import { badRequest } from '@shared/errors/app.error';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import type { PostMessageResult } from './chat.service.types';
import type { EnrichedImage, PostMessageInput } from '@modules/chat/domain/chat.types';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type {
  KnowledgeRouterPort,
  KnowledgeRouterSource,
} from '@modules/chat/domain/ports/knowledge-router.port';
import type { SearchResult } from '@modules/chat/domain/ports/web-search.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import type { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import type { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import type { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import type {
  LocationConsentChecker,
  LocationResolver,
  ResolvedLocation,
} from '@modules/chat/useCase/location/location-resolver';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';

/** Preparation succeeded — all data needed to invoke the LLM. */
export interface PrepareReady {
  kind: 'ready';
  session: Awaited<ReturnType<typeof ensureSessionAccess>>;
  imageRef?: string;
  orchestratorImage?: PostMessageInput['image'];
  requestedLocale?: string;
  history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>;
  ownerId?: number;
  userMemoryBlock?: string;
  knowledgeBaseBlock?: string;
  localKnowledgeBlock?: string;
  webSearchBlock?: string;
  enrichedImages?: EnrichedImage[];
  resolvedLocation?: ResolvedLocation;
  /**
   * C4.1 (T3.5) — Verified fact strings produced by `KnowledgeRouter.resolve()`.
   * Threaded into `OrchestratorInput.facts` so every orchestrator entry point
   * (full-shot / streaming / walk) wraps them in the Spotlighting envelope.
   * Empty / undefined when no router is wired or no facts grounded.
   */
  routerFacts?: readonly string[];
  /**
   * C4.1 (T3.5) — Provenance label from `KnowledgeRouterResult.source`. Maps to
   * `OrchestratorInput.factsSource`. `'none'` short-circuits the envelope.
   */
  routerSource?: KnowledgeRouterSource;
}

/** Guardrail-refused preparation — contains the ready-to-return refusal result. */
export interface PrepareRefused {
  kind: 'refused';
  result: PostMessageResult;
}

/**
 *
 */
export type PrepareResult = PrepareReady | PrepareRefused;

/**
 *
 */
export interface PrepareMessagePipelineDeps {
  repository: ChatRepository;
  imageProcessor: ImageProcessingService;
  guardrail: GuardrailEvaluationService;
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  /**
   * C4.1 (T3.3) — additive injection of the `KnowledgeRouterPort`. Not
   * consumed yet inside `enrichAndResolveLocation` ; T3.4 will replace the
   * direct `knowledgeBase` call in `fetchEnrichmentData` with this port and
   * drop the legacy field at C4.2.
   */
  knowledgeRouter?: KnowledgeRouterPort;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  locationResolver?: LocationResolver;
  /**
   * GDPR consent port. When supplied, location is only propagated to the LLM
   * prompt if the user has granted the `location_to_llm` scope. Without this
   * port the legacy behaviour (always propagate) stands — useful for tests
   * that pre-date the consent table.
   */
  locationConsentChecker?: LocationConsentChecker;
}

/**
 * Pre-LLM pipeline: validates input, processes image, runs input guardrail,
 * persists the user message, fetches enrichment, and resolves location.
 *
 * Extracted from ChatMessageService to keep each use-case file ≤ 300 LOC.
 */
export class PrepareMessagePipeline {
  private readonly repository: ChatRepository;
  private readonly imageProcessor: ImageProcessingService;
  private readonly guardrail: GuardrailEvaluationService;
  private readonly userMemory?: UserMemoryService;
  private readonly knowledgeBase?: KnowledgeBaseService;
  /**
   * C4.1 (T3.3) — held until T3.4 plumbs it into `enrichAndResolveLocation`.
   * Exposed via {@link getKnowledgeRouter} so the additive wiring step passes
   * `noUnusedLocals` while keeping the field private to the use-case.
   */
  private readonly knowledgeRouter?: KnowledgeRouterPort;
  private readonly imageEnrichment?: ImageEnrichmentService;
  private readonly webSearch?: WebSearchService;
  private readonly dbLookup?: DbLookupService;
  private readonly extractionQueue?: ExtractionQueuePort;
  private readonly locationResolver?: LocationResolver;
  private readonly locationConsentChecker?: LocationConsentChecker;

  constructor(deps: PrepareMessagePipelineDeps) {
    this.repository = deps.repository;
    this.imageProcessor = deps.imageProcessor;
    this.guardrail = deps.guardrail;
    this.userMemory = deps.userMemory;
    this.knowledgeBase = deps.knowledgeBase;
    this.knowledgeRouter = deps.knowledgeRouter;
    this.imageEnrichment = deps.imageEnrichment;
    this.webSearch = deps.webSearch;
    this.dbLookup = deps.dbLookup;
    this.extractionQueue = deps.extractionQueue;
    this.locationResolver = deps.locationResolver;
    this.locationConsentChecker = deps.locationConsentChecker;
  }

  /**
   * C4.1 (T3.3) — read-only accessor for the wired router. Consumed by T3.4
   * (LLM prompt builder) + integration tests asserting the wiring is healthy.
   * Returns `undefined` only on legacy test harnesses that build the pipeline
   * without the C4 port.
   */
  getKnowledgeRouter(): KnowledgeRouterPort | undefined {
    return this.knowledgeRouter;
  }

  private validateMessageInput(text: string | undefined, image: PostMessageInput['image']): void {
    if (text && text.length > env.llm.maxTextLength) {
      throw badRequest(`text must be <= ${String(env.llm.maxTextLength)} characters`);
    }
    if (!text && !image) {
      throw badRequest('Either text or image is required');
    }
  }

  private enqueueForExtraction(
    results: SearchResult[],
    text: string | undefined,
    locale: string | undefined,
  ): void {
    if (!this.extractionQueue || results.length === 0 || !locale) return;
    const queue = this.extractionQueue;
    const searchTerm = text ?? '';
    // Wrap in Promise.resolve().then so a sync throw (e.g. queue closed with
    // enableOfflineQueue: false when Redis is down) becomes a rejection that
    // fireAndForget logs, instead of bubbling into the chat hot path.
    fireAndForget(
      Promise.resolve().then(() =>
        queue.enqueueUrls(results.slice(0, 5).map((r) => ({ url: r.url, searchTerm, locale }))),
      ),
      'extraction_enqueue_web_results',
    );
  }

  private async processInputImage(
    image: PostMessageInput['image'],
    sessionId: string,
    ownerId: number | undefined,
  ): Promise<{ imageRef?: string; orchestratorImage?: PostMessageInput['image'] }> {
    if (!image) return {};

    const processed = await this.imageProcessor.processImage(image, sessionId, ownerId);
    await this.imageProcessor.runOcrGuard(
      processed.orchestratorImage,
      evaluateUserInputGuardrail,
      sessionId,
    );
    return { imageRef: processed.imageRef, orchestratorImage: processed.orchestratorImage };
  }

  /** Validates session, processes image, runs input guardrail, persists user message, fetches enrichment. */
  async prepare(
    sessionId: string,
    input: PostMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PrepareResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);
    const ownerId = session.user?.id;

    const text = input.text?.trim();
    this.validateMessageInput(text, input.image);

    const { imageRef, orchestratorImage } = await this.processInputImage(
      input.image,
      sessionId,
      ownerId ?? currentUserId,
    );

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const requestedLocale = input.context?.locale?.trim() || session.locale || undefined;

    const userGuardrail = await this.guardrail.evaluateInput(text, input.context?.preClassified, {
      sessionId,
      userId: ownerId ?? currentUserId,
      requestId,
      ip,
      locale: requestedLocale,
    });

    if (!userGuardrail.allow) {
      // Both user attempt and refusal are always persisted — the user row is the moderation
      // audit trail. Atomic TX guarantees neither row lands without the other.
      const result = await this.guardrail.handleInputBlock({
        sessionId,
        reason: userGuardrail.reason,
        requestedLocale,
        userId: ownerId,
        userMessage: { sessionId, role: 'user', text, imageRef },
      });
      return { kind: 'refused', result };
    }

    await this.repository.persistMessage({ sessionId, role: 'user', text, imageRef });

    const history = await this.repository.listSessionHistory(sessionId, env.llm.maxHistoryMessages);
    const enrichment = await this.enrichAndResolveLocation({
      input,
      session,
      requestedLocale,
      history,
      ownerId,
      currentUserId,
    });

    return {
      kind: 'ready',
      session,
      imageRef,
      orchestratorImage,
      requestedLocale,
      history,
      ownerId,
      ...enrichment,
    };
  }

  /**
   * C4.1 (T3.5) — Resolve verified facts via `KnowledgeRouter` when wired.
   * Fail-open per port contract (the router NEVER throws — see ADR-035). Returns
   * `{ routerFacts: [], routerSource: 'none' }` when no router is injected
   * (legacy / test harness) or when no search term is available.
   */
  private async resolveRouterFacts(
    inputText: string | undefined,
  ): Promise<{ routerFacts: readonly string[]; routerSource: KnowledgeRouterSource }> {
    const router = this.knowledgeRouter;
    const searchTerm = inputText?.trim();
    if (!router || !searchTerm) {
      return { routerFacts: [], routerSource: 'none' };
    }
    const result = await router.resolve(searchTerm);
    return { routerFacts: result.facts, routerSource: result.source };
  }

  /** Post-validation enrichment + location resolution (extracted to keep `prepare` under max-lines). */
  private async enrichAndResolveLocation(args: {
    input: PostMessageInput;
    session: ChatSession;
    requestedLocale: string | undefined;
    history: ChatMessage[];
    ownerId: number | undefined;
    currentUserId: number | undefined;
  }): Promise<{
    userMemoryBlock: string | undefined;
    knowledgeBaseBlock: string | undefined;
    localKnowledgeBlock: string | undefined;
    webSearchBlock: string | undefined;
    enrichedImages: EnrichedImage[];
    resolvedLocation: ResolvedLocation | undefined;
    routerFacts: readonly string[];
    routerSource: KnowledgeRouterSource;
  }> {
    const { input, session, requestedLocale, history, ownerId, currentUserId } = args;
    const {
      userMemoryBlock,
      knowledgeBaseBlock,
      localKnowledgeBlock,
      webSearchBlock,
      webSearchResults,
      enrichedImages,
    } = await fetchEnrichmentData({
      deps: {
        userMemory: this.userMemory,
        knowledgeBase: this.knowledgeBase,
        imageEnrichment: this.imageEnrichment,
        webSearch: this.webSearch,
        dbLookup: this.dbLookup,
      },
      history,
      inputText: input.text?.trim(),
      ownerId,
      locale: requestedLocale,
      museumMode: input.context?.museumMode ?? session.museumMode,
    });

    this.enqueueForExtraction(webSearchResults, input.text?.trim(), requestedLocale);

    const resolvedLocation = await resolveLocationForMessage(
      this.locationResolver,
      input.context?.location,
      session,
      {
        userId: ownerId ?? currentUserId,
        consentChecker: this.locationConsentChecker,
      },
    );

    const { routerFacts, routerSource } = await this.resolveRouterFacts(input.text?.trim());

    return {
      userMemoryBlock,
      knowledgeBaseBlock,
      localKnowledgeBlock,
      webSearchBlock,
      enrichedImages,
      resolvedLocation: resolvedLocation ?? undefined,
      routerFacts,
      routerSource,
    };
  }

  /** Builds the OrchestratorInput shape from a successful prepare result. */
  buildOrchestratorInput(
    prep: PrepareReady,
    input: PostMessageInput,
    sanitizedText: string,
    requestId?: string,
  ): OrchestratorInput {
    return {
      history: prep.history,
      text: sanitizedText,
      image: prep.orchestratorImage,
      locale: prep.requestedLocale,
      museumMode: input.context?.museumMode ?? prep.session.museumMode,
      context: {
        location: input.context?.location,
        guideLevel: input.context?.guideLevel,
      },
      visitContext: prep.session.visitContext,
      requestId,
      userMemoryBlock: prep.userMemoryBlock,
      knowledgeBaseBlock: prep.knowledgeBaseBlock,
      localKnowledgeBlock: prep.localKnowledgeBlock,
      webSearchBlock: prep.webSearchBlock,
      audioDescriptionMode: input.context?.audioDescriptionMode,
      lowDataMode: input.context?.lowDataMode ?? false,
      resolvedLocation: prep.resolvedLocation,
      contentPreferences: input.context?.contentPreferences,
      // Cache scoping (R1): museumId + userId let the caching orchestrator
      // pick the correct global-vs-user-scoped key namespace.
      museumId: prep.session.museumId ?? null,
      userId: prep.ownerId ?? null,
      // Walk-intent routing: propagated so the orchestrator can select the
      // walk prompt section and return structured suggestions.
      intent: prep.session.intent,
      // C4.1 (T3.5) — KnowledgeRouter facts + provenance threaded through to
      // every orchestrator entry point. Optional; absent on legacy harnesses
      // that build the pipeline without a `KnowledgeRouterPort`.
      facts: prep.routerFacts,
      factsSource: prep.routerSource,
    };
  }
}
