import { fetchEnrichmentData } from '@modules/chat/useCase/enrichment/enrichment-fetcher';
import { evaluateUserInputGuardrail } from '@modules/chat/useCase/guardrail/art-topic-guardrail';
import { resolveLocationForMessage } from '@modules/chat/useCase/location-resolver';
import { checkThirdPartyAiConsent } from '@modules/chat/useCase/orchestration/consent-gate';
import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import { invalidInput } from '@shared/errors/app.error';
import { deriveTier } from '@shared/observability/derive-tier';
import { maskPersonalData } from '@shared/pii/mask-personal-data';
import { nonEmpty } from '@shared/utils/defaults';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import type { PostMessageResult } from './chat.service.types';
import type {
  CitationSource,
  EnrichedImage,
  PostMessageInput,
} from '@modules/chat/domain/chat.types';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { SearchResult } from '@modules/chat/domain/ports/web-search.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import type { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import type { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import type { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import type {
  KnowledgeRouterPort,
  KnowledgeRouterSource,
} from '@modules/chat/useCase/knowledge/knowledge-router.service';
import type {
  LocationConsentChecker,
  LocationResolver,
  ResolvedLocation,
} from '@modules/chat/useCase/location-resolver';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import type { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';
import type { LlmJudgeScope } from '@shared/observability/derive-tier';

export interface PrepareReady {
  kind: 'ready';
  session: Awaited<ReturnType<typeof ensureSessionAccess>>;
  currentArtwork?: { title: string; roomId: string | null } | null;
  imageRef?: string;
  orchestratorImage?: PostMessageInput['image'];
  imageContentHash?: string;
  requestedLocale?: string;
  history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>;
  ownerId?: number;
  userMemoryBlock?: string;
  knowledgeBaseBlock?: string;
  localKnowledgeBlock?: string;
  webSearchBlock?: string;
  enrichedImages?: EnrichedImage[];
  resolvedLocation?: ResolvedLocation;
  routerFacts?: readonly string[];
  routerSources?: readonly CitationSource[];
  routerSource?: KnowledgeRouterSource;
}

export interface PrepareRefused {
  kind: 'refused';
  result: PostMessageResult;
  securityBlock?: boolean;
}

export type PrepareResult = PrepareReady | PrepareRefused;

export interface PrepareMessagePipelineDeps {
  repository: ChatRepository;
  imageProcessor: ImageProcessingService;
  guardrail: GuardrailEvaluationService;
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  knowledgeRouter?: KnowledgeRouterPort;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  locationResolver?: LocationResolver;
  locationConsentChecker?: LocationConsentChecker;
  thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker;
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
}

export class PrepareMessagePipeline {
  private readonly repository: ChatRepository;
  private readonly imageProcessor: ImageProcessingService;
  private readonly guardrail: GuardrailEvaluationService;
  private readonly userMemory?: UserMemoryService;
  private readonly knowledgeBase?: KnowledgeBaseService;
  private readonly knowledgeRouter?: KnowledgeRouterPort;
  private readonly imageEnrichment?: ImageEnrichmentService;
  private readonly webSearch?: WebSearchService;
  private readonly dbLookup?: DbLookupService;
  private readonly extractionQueue?: ExtractionQueuePort;
  private readonly locationResolver?: LocationResolver;
  private readonly locationConsentChecker?: LocationConsentChecker;
  private readonly thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker;
  private readonly artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;

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
    this.thirdPartyAiConsentChecker = deps.thirdPartyAiConsentChecker;
    this.artworkKnowledgeRepo = deps.artworkKnowledgeRepo;
  }

  getKnowledgeRouter(): KnowledgeRouterPort | undefined {
    return this.knowledgeRouter;
  }

  private validateMessageInput(text: string | undefined, image: PostMessageInput['image']): void {
    if (text && text.length > env.llm.maxTextLength) {
      throw invalidInput(`text must be <= ${String(env.llm.maxTextLength)} characters`);
    }
    if (!text && !image) {
      throw invalidInput('Either text or image is required');
    }
  }

  private enqueueForExtraction(results: SearchResult[], locale: string | undefined): void {
    if (!this.extractionQueue || results.length === 0 || !locale) return;
    const queue = this.extractionQueue;
    fireAndForget(
      Promise.resolve().then(() =>
        queue.enqueueUrls(results.slice(0, 5).map((r) => ({ url: r.url, locale }))),
      ),
      'extraction_enqueue_web_results',
    );
  }

  private async processInputImage(
    image: PostMessageInput['image'],
    sessionId: string,
    ownerId: number | undefined,
  ): Promise<{
    imageRef?: string;
    orchestratorImage?: PostMessageInput['image'];
    imageContentHash?: string;
  }> {
    if (!image) return {};

    const processed = await this.imageProcessor.processImage(image, sessionId, ownerId);
    await this.imageProcessor.runOcrGuard(
      processed.orchestratorImage,
      evaluateUserInputGuardrail,
      sessionId,
    );
    return {
      imageRef: processed.imageRef,
      orchestratorImage: processed.orchestratorImage,
      imageContentHash: processed.imageContentHash,
    };
  }

  private async runConsentGate(
    sessionId: string,
    input: PostMessageInput,
    text: string | undefined,
    currentUserId: number | undefined,
  ): Promise<PrepareRefused | null> {
    return await checkThirdPartyAiConsent({
      checker: this.thirdPartyAiConsentChecker,
      input: {
        sessionId,
        text,
        image: input.image,
        imageRef: undefined,
        currentUserId,
        requestedLocale: input.context?.locale?.trim() ?? undefined,
      },
    });
  }

  async prepare(
    sessionId: string,
    input: PostMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PrepareResult> {
    const text = input.text?.trim();
    this.validateMessageInput(text, input.image);

    const consentRefusal = await this.runConsentGate(sessionId, input, text, currentUserId);
    if (consentRefusal) return consentRefusal;

    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);
    const ownerId = session.user?.id;

    const { imageRef, orchestratorImage, imageContentHash } = await this.processInputImage(
      input.image,
      sessionId,
      ownerId ?? currentUserId,
    );

    const requestedLocale = nonEmpty(input.context?.locale?.trim()) ?? nonEmpty(session.locale);

    const userGuardrail = await this.guardrail.evaluateInput(text, input.context?.preClassified, {
      sessionId,
      userId: ownerId ?? currentUserId,
      requestId,
      ip,
      locale: requestedLocale,
    });

    if (!userGuardrail.allow) {
      const result = await this.guardrail.handleInputBlock({
        sessionId,
        reason: userGuardrail.reason,
        requestedLocale,
        userId: ownerId,
        userMessage: { sessionId, role: 'user', text, imageRef },
      });
      const securityBlock =
        userGuardrail.reason !== undefined && userGuardrail.reason !== 'off_topic';
      return { kind: 'refused', result, securityBlock };
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
      requestId,
    });

    const currentArtwork = await this.resolveCurrentArtwork(session);

    return {
      kind: 'ready',
      session,
      imageRef,
      orchestratorImage,
      imageContentHash,
      requestedLocale,
      history,
      ownerId,
      ...(currentArtwork !== undefined ? { currentArtwork } : {}),
      ...enrichment,
    };
  }

  private async resolveCurrentArtwork(
    session: ChatSession,
  ): Promise<{ title: string; roomId: string | null } | null | undefined> {
    const repo = this.artworkKnowledgeRepo;
    const currentArtworkId = session.currentArtworkId;
    if (!repo || !currentArtworkId) return undefined;
    try {
      const row = await repo.findById(currentArtworkId, session.museumId);
      if (!row) return null;
      return { title: row.title, roomId: row.roomId ?? session.currentRoom ?? null };
    } catch {
      return null;
    }
  }

  private async resolveRouterFacts(
    inputText: string | undefined,
    scope?: LlmJudgeScope,
  ): Promise<{
    routerFacts: readonly string[];
    routerSources: readonly CitationSource[];
    routerSource: KnowledgeRouterSource;
  }> {
    const router = this.knowledgeRouter;
    const searchTerm = inputText?.trim();
    if (!router || !searchTerm) {
      return { routerFacts: [], routerSources: [], routerSource: 'none' };
    }
    const result = await router.resolve(searchTerm, undefined, scope);
    return {
      routerFacts: result.facts,
      routerSources: result.sources,
      routerSource: result.source,
    };
  }

  private async enrichAndResolveLocation(args: {
    input: PostMessageInput;
    session: ChatSession;
    requestedLocale: string | undefined;
    history: ChatMessage[];
    ownerId: number | undefined;
    currentUserId: number | undefined;
    requestId: string | undefined;
  }): Promise<{
    userMemoryBlock: string | undefined;
    knowledgeBaseBlock: string | undefined;
    localKnowledgeBlock: string | undefined;
    webSearchBlock: string | undefined;
    enrichedImages: EnrichedImage[];
    resolvedLocation: ResolvedLocation | undefined;
    routerFacts: readonly string[];
    routerSources: readonly CitationSource[];
    routerSource: KnowledgeRouterSource;
  }> {
    const { input, session, requestedLocale, history, ownerId, currentUserId, requestId } = args;
    const routerScope: LlmJudgeScope = {
      ...(session.museumId != null ? { museumId: session.museumId } : {}),
      tier: deriveTier(ownerId ?? currentUserId),
      ...(requestId !== undefined ? { requestId } : {}),
    };
    const searchText = input.text ? maskPersonalData(input.text).text.trim() : undefined;
    const [
      {
        userMemoryBlock,
        knowledgeBaseBlock,
        localKnowledgeBlock,
        webSearchBlock,
        webSearchResults,
        enrichedImages,
      },
      resolvedLocation,
      { routerFacts, routerSources, routerSource },
    ] = await Promise.all([
      fetchEnrichmentData({
        deps: {
          userMemory: this.userMemory,
          knowledgeBase: this.knowledgeBase,
          imageEnrichment: this.imageEnrichment,
          webSearch: this.webSearch,
          dbLookup: this.dbLookup,
        },
        history,
        inputText: searchText,
        ownerId,
        locale: requestedLocale,
        museumMode: input.context?.museumMode ?? session.museumMode,
      }),
      resolveLocationForMessage(this.locationResolver, input.context?.location, session, {
        userId: ownerId ?? currentUserId,
        consentChecker: this.locationConsentChecker,
      }),
      this.resolveRouterFacts(searchText, routerScope),
    ]);

    this.enqueueForExtraction(webSearchResults, requestedLocale);

    return {
      userMemoryBlock,
      knowledgeBaseBlock,
      localKnowledgeBlock,
      webSearchBlock,
      enrichedImages,
      resolvedLocation: resolvedLocation ?? undefined,
      routerFacts,
      routerSources,
      routerSource,
    };
  }

  buildOrchestratorInput(
    prep: PrepareReady,
    input: PostMessageInput,
    userText: string,
    requestId?: string,
  ): OrchestratorInput {
    return {
      history: prep.history.map((message) =>
        message.text
          ? Object.assign(
              Object.create(Object.getPrototypeOf(message) as object) as ChatMessage,
              message,
              {
                text: maskPersonalData(message.text).text,
              },
            )
          : message,
      ),
      text: maskPersonalData(userText).text,
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
      voiceMode: input.context?.voiceMode,
      lowDataMode: input.context?.lowDataMode ?? false,
      resolvedLocation: prep.resolvedLocation,
      contentPreferences: input.context?.contentPreferences,
      museumId: prep.session.museumId ?? null,
      userId: prep.ownerId ?? null,
      sessionId: prep.session.id,
      intent: prep.session.intent,
      facts: prep.routerFacts,
      factsSource: prep.routerSource,
      currentArtwork: prep.currentArtwork ?? null,
    };
  }
}
