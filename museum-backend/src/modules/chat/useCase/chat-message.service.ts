import { AppError, badRequest } from '@shared/errors/app.error';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import { evaluateUserInputGuardrail } from './art-topic-guardrail';
import { validateAudioInput } from './audio-validation';
import { fetchEnrichmentData } from './enrichment-fetcher';
import { GuardrailEvaluationService } from './guardrail-evaluation.service';
import { ImageProcessingService } from './image-processing.service';
import { resolveLocationForMessage } from './location-resolver';
import { commitAssistantResponse } from './message-commit';
import { ensureSessionAccess } from './session-access';
import { StreamBuffer } from './stream-buffer';
import { DisabledAudioTranscriber } from '../domain/ports/audio-transcriber.port';
import { DisabledPiiSanitizer } from '../domain/ports/pii-sanitizer.port';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { PostMessageResult, PostAudioMessageResult } from './chat.service.types';
import type { ArtTopicClassifierPort } from './guardrail-evaluation.service';
import type { ImageEnrichmentService } from './image-enrichment.service';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type { LocationResolver, ResolvedLocation } from './location-resolver';
import type { UserMemoryService } from './user-memory.service';
import type { WebSearchService } from './web-search.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { EnrichedImage, PostAudioMessageInput, PostMessageInput } from '../domain/chat.types';
import type { AdvancedGuardrail } from '../domain/ports/advanced-guardrail.port';
import type { AudioTranscriber } from '../domain/ports/audio-transcriber.port';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '../domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '../domain/ports/image-storage.port';
import type { OcrService } from '../domain/ports/ocr.port';
import type { PiiSanitizer } from '../domain/ports/pii-sanitizer.port';
import type { SearchResult } from '../domain/ports/web-search.port';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/db-lookup.service';
import type { AuditService } from '@shared/audit/audit.service';
import type { CacheService } from '@shared/cache/cache.port';

/** Dependencies for the message sub-service. */
export interface ChatMessageServiceDeps {
  repository: ChatRepository;
  orchestrator: ChatOrchestrator;
  imageStorage: ImageStorage;
  audioTranscriber?: AudioTranscriber;
  cache?: CacheService;
  ocr?: OcrService;
  audit?: AuditService;
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  artTopicClassifier?: ArtTopicClassifierPort;
  advancedGuardrail?: AdvancedGuardrail;
  advancedGuardrailObserveOnly?: boolean;
  piiSanitizer?: PiiSanitizer;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  locationResolver?: LocationResolver;
}

/** Successful preparation result with all data needed to invoke the LLM. */
interface PrepareReady {
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

/** Guardrail-refused preparation result. */
interface PrepareRefused {
  kind: 'refused';
  result: PostMessageResult;
}

type PrepareResult = PrepareReady | PrepareRefused;

/** Awaits stream drain with a safety timeout to prevent indefinite hangs. */
async function awaitDrainWithTimeout(buffer: StreamBuffer, timeoutMs = 30_000): Promise<void> {
  let drainTimeoutId: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    buffer.awaitDone(),
    new Promise<void>((resolve) => {
      drainTimeoutId = setTimeout(() => {
        buffer.destroy();
        resolve();
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (drainTimeoutId !== undefined) clearTimeout(drainTimeoutId);
  });
}

/**
 * Handles the message lifecycle: prepare, post, stream, and commit assistant responses.
 */
export class ChatMessageService {
  private readonly repository: ChatRepository;
  private readonly orchestrator: ChatOrchestrator;
  private readonly imageProcessor: ImageProcessingService;
  private readonly guardrail: GuardrailEvaluationService;
  private readonly audioTranscriber: AudioTranscriber;
  private readonly cache?: CacheService;
  private readonly userMemory?: UserMemoryService;
  private readonly knowledgeBase?: KnowledgeBaseService;
  private readonly imageEnrichment?: ImageEnrichmentService;
  private readonly webSearch?: WebSearchService;
  private readonly artTopicClassifier?: ArtTopicClassifierPort;
  private readonly piiSanitizer: PiiSanitizer;
  private readonly dbLookup?: DbLookupService;
  private readonly extractionQueue?: ExtractionQueuePort;
  private readonly locationResolver?: LocationResolver;

  constructor(deps: ChatMessageServiceDeps) {
    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();
    this.cache = deps.cache;
    this.userMemory = deps.userMemory;
    this.knowledgeBase = deps.knowledgeBase;
    this.imageEnrichment = deps.imageEnrichment;
    this.webSearch = deps.webSearch;
    this.artTopicClassifier = deps.artTopicClassifier;
    this.piiSanitizer = deps.piiSanitizer ?? new DisabledPiiSanitizer();
    this.dbLookup = deps.dbLookup;
    this.extractionQueue = deps.extractionQueue;
    this.locationResolver = deps.locationResolver;

    this.imageProcessor = new ImageProcessingService({
      imageStorage: deps.imageStorage,
      ocr: deps.ocr,
    });

    this.guardrail = new GuardrailEvaluationService({
      repository: deps.repository,
      audit: deps.audit,
      artTopicClassifier: deps.artTopicClassifier,
      advancedGuardrail: deps.advancedGuardrail,
      advancedGuardrailObserveOnly: deps.advancedGuardrailObserveOnly,
    });
  }

  /** Validates that the message input has text or image and respects length limits. */
  private validateMessageInput(text: string | undefined, image: PostMessageInput['image']): void {
    if (text && text.length > env.llm.maxTextLength) {
      throw badRequest(`text must be <= ${String(env.llm.maxTextLength)} characters`);
    }
    if (!text && !image) {
      throw badRequest('Either text or image is required');
    }
  }

  /** Fire-and-forget: enqueues web search URLs for background extraction. */
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

  /** Processes and stores the image, then runs OCR injection guard. Returns refs or undefined. */
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

  /** Shared pre-LLM logic: validates session, processes image, runs input guardrail, persists user message. */
  private async prepareMessage(
    sessionId: string,
    input: PostMessageInput,
    _requestId?: string,
    currentUserId?: number,
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

    const userGuardrail = await this.guardrail.evaluateInput(text, input.context?.preClassified);

    if (!userGuardrail.allow) {
      // On block: persist the user attempt AND the refusal atomically (single TX).
      // Preserves the audit/moderation requirement (user row is kept, cf.
      // chat-message-service.test.ts:403/:414) while removing the orphan-row bug
      // where one side of the pair could land alone if the second write failed.
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
    const rawLoc = input.context?.location;
    const resolvedLocation = await resolveLocationForMessage(
      this.locationResolver,
      rawLoc,
      session,
    );

    return {
      kind: 'ready',
      session,
      imageRef,
      orchestratorImage,
      requestedLocale,
      history,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
      localKnowledgeBlock,
      webSearchBlock,
      enrichedImages,
      resolvedLocation,
    };
  }

  /** Builds the OrchestratorInput shape shared by postMessage and postMessageStream. */
  private buildOrchestratorInput(
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
    };
  }

  /** Commits the assistant response with the shared deps used by all public methods. */
  private async commitResponse(
    sessionId: string,
    prep: PrepareReady,
    aiResult: OrchestratorOutput,
  ): Promise<PostMessageResult> {
    return await commitAssistantResponse(
      {
        guardrail: this.guardrail,
        repository: this.repository,
        cache: this.cache,
        userMemory: this.userMemory,
      },
      sessionId,
      prep.session,
      aiResult,
      {
        requestedLocale: prep.requestedLocale,
        ownerId: prep.ownerId,
        enrichedImages: prep.enrichedImages,
      },
    );
  }

  /** Posts a message and returns the assistant response (non-streaming). */
  async postMessage(
    sessionId: string,
    input: PostMessageInput,
    requestId?: string,
    currentUserId?: number,
  ): Promise<PostMessageResult> {
    const prep = await this.prepareMessage(sessionId, input, requestId, currentUserId);
    if (prep.kind === 'refused') return prep.result;

    const sanitizedText = this.piiSanitizer.sanitize(input.text?.trim() ?? '').sanitizedText;
    const aiResult = await this.orchestrator.generate(
      this.buildOrchestratorInput(prep, input, sanitizedText, requestId),
    );

    return await this.commitResponse(sessionId, prep, aiResult);
  }

  /**
   * Posts a message with token-by-token streaming and incremental guardrail checks.
   *
   * @deprecated SSE streaming retired in V1 — see `docs/adr/ADR-001-sse-streaming-deprecated.md`.
   *   Use `postMessage` instead.
   */
  async postMessageStream(
    sessionId: string,
    input: PostMessageInput,
    callbacks: {
      onToken: (text: string) => void;
      onGuardrail?: (text: string, reason: GuardrailBlockReason) => void;
      requestId?: string;
      currentUserId?: number;
      signal?: AbortSignal;
    },
  ): Promise<PostMessageResult> {
    const { onToken, onGuardrail, requestId, currentUserId, signal } = callbacks;
    const prep = await this.prepareMessage(sessionId, input, requestId, currentUserId);
    if (prep.kind === 'refused') return prep.result;

    if (signal?.aborted) {
      throw new AppError({ message: 'Request aborted', statusCode: 499, code: 'ABORTED' });
    }

    const buffer = new StreamBuffer({
      classifier: this.artTopicClassifier,
      locale: prep.requestedLocale,
      signal,
      onGuardrail,
    });
    buffer.onRelease(onToken);
    const sanitizedText = this.piiSanitizer.sanitize(input.text?.trim() ?? '').sanitizedText;

    const aiResult = await this.orchestrator.generateStream(
      this.buildOrchestratorInput(prep, input, sanitizedText, requestId),
      (chunk) => {
        buffer.push(chunk);
      },
    );

    buffer.finish();
    await buffer.awaitPhase1();
    await awaitDrainWithTimeout(buffer);

    return await this.commitResponse(sessionId, prep, aiResult);
  }

  /** Transcribes an audio message then delegates to postMessage for LLM processing. */
  async postAudioMessage(
    sessionId: string,
    input: PostAudioMessageInput,
    requestId?: string,
    currentUserId?: number,
  ): Promise<PostAudioMessageResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    validateAudioInput(input.audio);

    const transcription = await this.audioTranscriber.transcribe({
      base64: input.audio.base64,
      mimeType: input.audio.mimeType,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      locale: input.context?.locale || session.locale || undefined,
      requestId,
    });

    const response = await this.postMessage(
      sessionId,
      {
        text: transcription.text,
        context: input.context,
      },
      requestId,
      currentUserId,
    );

    return {
      ...response,
      transcription,
    };
  }
}
