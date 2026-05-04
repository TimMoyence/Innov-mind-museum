import { badRequest } from '@shared/errors/app.error';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import { evaluateUserInputGuardrail } from './art-topic-guardrail';
import { fetchEnrichmentData } from './enrichment-fetcher';
import { resolveLocationForMessage } from './location-resolver';
import { ensureSessionAccess } from './session-access';

import type { PostMessageResult } from './chat.service.types';
import type { GuardrailEvaluationService } from './guardrail-evaluation.service';
import type { ImageEnrichmentService } from './image-enrichment.service';
import type { ImageProcessingService } from './image-processing.service';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type {
  LocationConsentChecker,
  LocationResolver,
  ResolvedLocation,
} from './location-resolver';
import type { UserMemoryService } from './user-memory.service';
import type { WebSearchService } from './web-search.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { EnrichedImage, PostMessageInput } from '../domain/chat.types';
import type { ChatMessage } from '../domain/chatMessage.entity';
import type { ChatSession } from '../domain/chatSession.entity';
import type { OrchestratorInput } from '../domain/ports/chat-orchestrator.port';
import type { SearchResult } from '../domain/ports/web-search.port';
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
    this.imageEnrichment = deps.imageEnrichment;
    this.webSearch = deps.webSearch;
    this.dbLookup = deps.dbLookup;
    this.extractionQueue = deps.extractionQueue;
    this.locationResolver = deps.locationResolver;
    this.locationConsentChecker = deps.locationConsentChecker;
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
  }> {
    const { input, session, requestedLocale, history, ownerId, currentUserId } = args;
    const {
      userMemoryBlock,
      knowledgeBaseBlock,
      localKnowledgeBlock,
      webSearchBlock,
      webSearchResults,
      enrichedImages,
    } = await fetchEnrichmentData(
      {
        userMemory: this.userMemory,
        knowledgeBase: this.knowledgeBase,
        imageEnrichment: this.imageEnrichment,
        webSearch: this.webSearch,
        dbLookup: this.dbLookup,
      },
      history,
      input.text?.trim(),
      ownerId,
      requestedLocale,
    );

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

    return {
      userMemoryBlock,
      knowledgeBaseBlock,
      localKnowledgeBlock,
      webSearchBlock,
      enrichedImages,
      resolvedLocation: resolvedLocation ?? undefined,
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
    };
  }
}
