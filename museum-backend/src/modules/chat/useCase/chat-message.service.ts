import { AppError, badRequest } from '@shared/errors/app.error';

import { validateAudioInput } from './audio-validation';
import { GuardrailEvaluationService } from './guardrail-evaluation.service';
import { ImageProcessingService } from './image-processing.service';
import { commitAssistantResponse } from './message-commit';
import { PrepareMessagePipeline } from './prepare-message.pipeline';
import { ensureSessionAccess } from './session-access';
import { StreamBuffer } from './stream-buffer';
import { DisabledAudioTranscriber } from '../domain/ports/audio-transcriber.port';
import { DisabledPiiSanitizer } from '../domain/ports/pii-sanitizer.port';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { PostMessageResult, PostAudioMessageResult } from './chat.service.types';
import type { ArtTopicClassifierPort } from './guardrail-evaluation.service';
import type { ImageEnrichmentService } from './image-enrichment.service';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type { LocationConsentChecker, LocationResolver } from './location-resolver';
import type { PrepareReady } from './prepare-message.pipeline';
import type { UserMemoryService } from './user-memory.service';
import type { WebSearchService } from './web-search.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { PostAudioMessageInput, PostMessageInput } from '../domain/chat.types';
import type { AdvancedGuardrail } from '../domain/ports/advanced-guardrail.port';
import type {
  AudioTranscriptionResult,
  AudioTranscriber,
} from '../domain/ports/audio-transcriber.port';
import type { ChatOrchestrator, OrchestratorOutput } from '../domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '../domain/ports/image-storage.port';
import type { OcrService } from '../domain/ports/ocr.port';
import type { PiiSanitizer } from '../domain/ports/pii-sanitizer.port';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/db-lookup.service';
import type { AuditService } from '@shared/audit/audit.service';
import type { CacheService } from '@shared/cache/cache.port';

/** Content-enrichment services bundled together (replaces 7 individual deps). */
export interface ChatEnrichmentDeps {
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  locationResolver?: LocationResolver;
  /** GDPR consent port — gates whether location reaches the LLM at all. */
  locationConsentChecker?: LocationConsentChecker;
}

/** Content-safety services bundled together (replaces 5 individual deps). */
export interface ChatSafetyDeps {
  artTopicClassifier?: ArtTopicClassifierPort;
  advancedGuardrail?: AdvancedGuardrail;
  advancedGuardrailObserveOnly?: boolean;
  audit?: AuditService;
  piiSanitizer?: PiiSanitizer;
}

/**
 * Dependencies for the message sub-service — 8 top-level deps (down from 18) via two
 * feature bundles: {@link ChatEnrichmentDeps} and {@link ChatSafetyDeps}.
 */
export interface ChatMessageServiceDeps {
  repository: ChatRepository; // 1 — session + message persistence
  orchestrator: ChatOrchestrator; // 2 — LLM call
  imageStorage: ImageStorage; // 3 — upload / ref resolution
  audioTranscriber?: AudioTranscriber; // 4 — STT (postAudioMessage path)
  cache?: CacheService; // 5 — response caching
  ocr?: OcrService; // 6 — OCR text extraction from images
  enrichment?: ChatEnrichmentDeps; // 7 — knowledge / web / memory / location
  safety?: ChatSafetyDeps; // 8 — guardrails + PII sanitiser
}

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
 * Orchestrates the message lifecycle: delegates pre-LLM preparation to
 * {@link PrepareMessagePipeline}, then invokes the LLM and commits the response.
 */
export class ChatMessageService {
  private readonly repository: ChatRepository;
  private readonly orchestrator: ChatOrchestrator;
  private readonly guardrail: GuardrailEvaluationService;
  private readonly pipeline: PrepareMessagePipeline;
  private readonly audioTranscriber: AudioTranscriber;
  private readonly cache?: CacheService;
  private readonly userMemory?: UserMemoryService;
  private readonly artTopicClassifier?: ArtTopicClassifierPort;
  private readonly piiSanitizer: PiiSanitizer;

  constructor(deps: ChatMessageServiceDeps) {
    const enrichment = deps.enrichment ?? {};
    const safety = deps.safety ?? {};

    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();
    this.cache = deps.cache;
    this.userMemory = enrichment.userMemory;
    this.artTopicClassifier = safety.artTopicClassifier;
    this.piiSanitizer = safety.piiSanitizer ?? new DisabledPiiSanitizer();

    const imageProcessor = new ImageProcessingService({
      imageStorage: deps.imageStorage,
      ocr: deps.ocr,
    });

    this.guardrail = new GuardrailEvaluationService({
      repository: deps.repository,
      audit: safety.audit,
      artTopicClassifier: safety.artTopicClassifier,
      advancedGuardrail: safety.advancedGuardrail,
      advancedGuardrailObserveOnly: safety.advancedGuardrailObserveOnly,
    });

    this.pipeline = new PrepareMessagePipeline({
      repository: deps.repository,
      imageProcessor,
      guardrail: this.guardrail,
      userMemory: enrichment.userMemory,
      knowledgeBase: enrichment.knowledgeBase,
      imageEnrichment: enrichment.imageEnrichment,
      webSearch: enrichment.webSearch,
      dbLookup: enrichment.dbLookup,
      extractionQueue: enrichment.extractionQueue,
      locationResolver: enrichment.locationResolver,
      locationConsentChecker: enrichment.locationConsentChecker,
    });
  }

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
    const prep = await this.pipeline.prepare(sessionId, input, requestId, currentUserId);
    if (prep.kind === 'refused') return prep.result;

    const sanitizedText = this.piiSanitizer.sanitize(input.text?.trim() ?? '').sanitizedText;
    const aiResult = await this.orchestrator.generate(
      this.pipeline.buildOrchestratorInput(prep, input, sanitizedText, requestId),
    );

    return await this.commitResponse(sessionId, prep, aiResult);
  }

  /**
   * Posts a message with token-by-token streaming and incremental guardrail checks.
   *
   * Status: DEACTIVATED — SSE streaming paused post-V1 (token-fluidity issues, cf. ADR-001).
   *   Revival scheduled for V2.1 post-Walk feature. Use `postMessage` for all current flows.
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
    const prep = await this.pipeline.prepare(sessionId, input, requestId, currentUserId);
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
      this.pipeline.buildOrchestratorInput(prep, input, sanitizedText, requestId),
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

    let transcription: AudioTranscriptionResult;
    try {
      transcription = await this.audioTranscriber.transcribe({
        base64: input.audio.base64,
        mimeType: input.audio.mimeType,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        locale: input.context?.locale || session.locale || undefined,
        requestId,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw badRequest('audio_transcription_failed', {
        requestId,
        cause: err instanceof Error ? err.message : String(err),
      });
    }

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
