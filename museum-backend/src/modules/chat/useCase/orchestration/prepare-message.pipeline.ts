import { fetchEnrichmentData } from '@modules/chat/useCase/enrichment/enrichment-fetcher';
import { evaluateUserInputGuardrail } from '@modules/chat/useCase/guardrail/art-topic-guardrail';
import { resolveLocationForMessage } from '@modules/chat/useCase/location-resolver';
import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import { badRequest } from '@shared/errors/app.error';
import { emitChatPhaseSpan } from '@shared/observability/chat-phase-span';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import type { PostMessageResult } from './chat.service.types';
import type { EnrichedImage, PostMessageInput } from '@modules/chat/domain/chat.types';
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
import type { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';
import type { ChatPhaseOutcome } from '@shared/observability/chat-phase-timer';

export interface PrepareReady {
  kind: 'ready';
  session: Awaited<ReturnType<typeof ensureSessionAccess>>;
  /**
   * W3 (T5.4) — resolved from `session.currentArtworkId` via the
   * `ArtworkKnowledgeRepoPort` when present. Pre-sanitised title goes to the
   * LLM prompt builder's `[CURRENT ARTWORK]` section. `null` ≠ `undefined`:
   * `undefined` = lookup skipped (no `currentArtworkId`); `null` = lookup
   * attempted and no row found.
   */
  currentArtwork?: { title: string; roomId: string | null } | null;
  imageRef?: string;
  orchestratorImage?: PostMessageInput['image'];
  /**
   * SHA-256[:32] of post-EXIF-strip buffer. Present iff request carried
   * `upload`/legacy-base64 image AND processing succeeded. Threaded into
   * `buildLlmCacheInput` to lift image-bypass on LLM cache (R11/R12).
   */
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
  /**
   * LLM02 — sanitized user input when provider scrubbed PII. Message service
   * substitutes for `input.text` before LLM call so provider never sees raw PII.
   */
  redactedText?: string;
  /** Facts wrapped in Spotlighting envelope at orchestrator. */
  routerFacts?: readonly string[];
  /** `'none'` short-circuits envelope. */
  routerSource?: KnowledgeRouterSource;
}

export interface PrepareRefused {
  kind: 'refused';
  result: PostMessageResult;
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
  /**
   * GDPR — when supplied, location propagated to LLM prompt only if user
   * granted `location_to_llm` scope. Without port: legacy always-propagate.
   */
  locationConsentChecker?: LocationConsentChecker;
  /**
   * W3 (T5.4) — looked up for the LLM prompt `[CURRENT ARTWORK]` section
   * when `chatSession.currentArtworkId` is populated. Optional: when missing,
   * the section is simply never emitted (degrades gracefully).
   */
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
}

/**
 * Pre-LLM: validate → process image → input guardrail → persist user →
 * enrichment → location. Extracted from ChatMessageService for file size cap.
 */
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
    this.artworkKnowledgeRepo = deps.artworkKnowledgeRepo;
  }

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
    // Promise.resolve().then converts sync throw (queue closed w/ enableOfflineQueue:false
    // when Redis down) into rejection so fireAndForget logs it instead of bubbling.
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
  ): Promise<{
    imageRef?: string;
    orchestratorImage?: PostMessageInput['image'];
    imageContentHash?: string;
  }> {
    if (!image) return {};

    // A5 R2/R3 — analyzing-image span emitted ONLY when image present.
    // merged_bug_004 — span MUST emit on failure too (try/finally + outcome
    // attr; mirrors text-to-speech.openai.ts:115-132). runOcrGuard stays
    // OUTSIDE wrap — span scope is strictly processImage.
    const startedAtMs = Date.now();
    let outcome: ChatPhaseOutcome = 'success';
    let processed: Awaited<ReturnType<ImageProcessingService['processImage']>>;
    try {
      processed = await this.imageProcessor.processImage(image, sessionId, ownerId);
    } catch (err) {
      outcome = 'error';
      throw err;
    } finally {
      emitChatPhaseSpan('analyzing-image', startedAtMs, { sessionId, outcome });
    }
    await this.imageProcessor.runOcrGuard(
      processed.orchestratorImage,
      evaluateUserInputGuardrail,
      sessionId,
    );
    return {
      imageRef: processed.imageRef,
      orchestratorImage: processed.orchestratorImage,
      // C3 — undefined for url-source per R2.
      imageContentHash: processed.imageContentHash,
    };
  }

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

    const { imageRef, orchestratorImage, imageContentHash } = await this.processInputImage(
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
      // Both user attempt + refusal always persisted (user row = moderation
      // audit trail). Atomic TX: neither row lands without the other.
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

    // W3 (T5.4) — Resolve `[CURRENT ARTWORK]` block from session.currentArtworkId
    // when the visitor has scanned a cartel. Missing repo or missing id =
    // skip silently (degrades to no-block, never blocks the message).
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
      ...(userGuardrail.redactedText !== undefined
        ? { redactedText: userGuardrail.redactedText }
        : {}),
      ...(currentArtwork !== undefined ? { currentArtwork } : {}),
      ...enrichment,
    };
  }

  /**
   * W3 (T5.4) — Resolves the artwork the visitor is standing in front of so the
   * LLM prompt builder can render `[CURRENT ARTWORK]`. Returns:
   *   - `undefined` when no lookup attempted (no `currentArtworkId` on session
   *     OR no repo wired) — caller MUST NOT emit the section.
   *   - `null` when lookup attempted but the row was not found (deleted /
   *     malformed) — caller treats as "no artwork data available", same as
   *     undefined for the LLM but distinguishable in observability.
   *   - `{ title, roomId }` on a hit. `title` is pre-sanitised here so the
   *     prompt builder's defensive double-sanitisation is idempotent.
   */
  private async resolveCurrentArtwork(
    session: ChatSession,
  ): Promise<{ title: string; roomId: string | null } | null | undefined> {
    const repo = this.artworkKnowledgeRepo;
    const currentArtworkId = session.currentArtworkId;
    if (!repo || !currentArtworkId) return undefined;
    try {
      const row = await repo.findById(currentArtworkId);
      if (!row) return null;
      return { title: row.title, roomId: row.roomId ?? session.currentRoom ?? null };
    } catch {
      // Fail-open — degraded LLM prompt is preferable to a 500 on chat turn.
      return null;
    }
  }

  /** Fail-open per port (router NEVER throws — ADR-035). */
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
    // A5 R6 — searching-collection span wraps the (parallelized) enrichment
    // fan-out (C9.6). The three calls are independent — `Promise.all` makes
    // wall-clock ≈ max(t) instead of sum(t), saving ~200-500ms P50.
    const enrichmentStartedAtMs = Date.now();
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
      { routerFacts, routerSource },
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
        inputText: input.text?.trim(),
        ownerId,
        locale: requestedLocale,
        museumMode: input.context?.museumMode ?? session.museumMode,
      }),
      resolveLocationForMessage(this.locationResolver, input.context?.location, session, {
        userId: ownerId ?? currentUserId,
        consentChecker: this.locationConsentChecker,
      }),
      this.resolveRouterFacts(input.text?.trim()),
    ]);
    emitChatPhaseSpan('searching-collection', enrichmentStartedAtMs, {
      sessionId: session.id,
      hasMuseumMode: input.context?.museumMode ?? session.museumMode,
    });

    this.enqueueForExtraction(webSearchResults, input.text?.trim(), requestedLocale);

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
      // R1 cache scoping: museumId+userId pick global-vs-user-scoped key namespace.
      museumId: prep.session.museumId ?? null,
      userId: prep.ownerId ?? null,
      // C9.0 — Propagated to Langfuse `trace.sessionId` by `withLangfuseTrace`.
      sessionId: prep.session.id,
      // Walk-intent routing for walk prompt section + structured suggestions.
      intent: prep.session.intent,
      facts: prep.routerFacts,
      factsSource: prep.routerSource,
      // W3 (T5.4) — `null`/`undefined` collapsed to `null` here (the
      // orchestrator port + prompt builder treat both as "no block").
      currentArtwork: prep.currentArtwork ?? null,
    };
  }
}
