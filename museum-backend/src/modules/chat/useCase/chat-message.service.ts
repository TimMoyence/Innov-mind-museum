import { AppError, badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { evaluateUserInputGuardrail } from './art-topic-guardrail';
import { fetchEnrichmentData } from './enrichment-fetcher';
import { GuardrailEvaluationService } from './guardrail-evaluation.service';
import { ImageProcessingService } from './image-processing.service';
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
import type { UserMemoryService } from './user-memory.service';
import type { WebSearchService } from './web-search.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { EnrichedImage, PostAudioMessageInput, PostMessageInput } from '../domain/chat.types';
import type { AudioTranscriber } from '../domain/ports/audio-transcriber.port';
import type { ChatOrchestrator, OrchestratorOutput } from '../domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '../domain/ports/image-storage.port';
import type { OcrService } from '../domain/ports/ocr.port';
import type { PiiSanitizer } from '../domain/ports/pii-sanitizer.port';
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
  piiSanitizer?: PiiSanitizer;
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
  webSearchBlock?: string;
  enrichedImages?: EnrichedImage[];
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

    this.imageProcessor = new ImageProcessingService({
      imageStorage: deps.imageStorage,
      ocr: deps.ocr,
    });

    this.guardrail = new GuardrailEvaluationService({
      repository: deps.repository,
      audit: deps.audit,
      artTopicClassifier: deps.artTopicClassifier,
    });
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
    if (text && text.length > env.llm.maxTextLength) {
      throw badRequest(`text must be <= ${String(env.llm.maxTextLength)} characters`);
    }
    if (!text && !input.image) {
      throw badRequest('Either text or image is required');
    }

    const { imageRef, orchestratorImage } = await this.processInputImage(
      input.image,
      sessionId,
      ownerId ?? currentUserId,
    );

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const requestedLocale = input.context?.locale?.trim() || session.locale || undefined;

    const userGuardrail = await this.guardrail.evaluateInput(text, input.context?.preClassified);

    await this.repository.persistMessage({ sessionId, role: 'user', text, imageRef });

    if (!userGuardrail.allow) {
      const result = await this.guardrail.handleInputBlock({
        sessionId,
        reason: userGuardrail.reason,
        requestedLocale,
        userId: ownerId,
      });
      return { kind: 'refused', result };
    }

    const history = await this.repository.listSessionHistory(sessionId, env.llm.maxHistoryMessages);
    const { userMemoryBlock, knowledgeBaseBlock, webSearchBlock, enrichedImages } =
      await fetchEnrichmentData(
        {
          userMemory: this.userMemory,
          knowledgeBase: this.knowledgeBase,
          imageEnrichment: this.imageEnrichment,
          webSearch: this.webSearch,
        },
        history,
        input.text?.trim(),
        ownerId,
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
      webSearchBlock,
      enrichedImages,
    };
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

    const {
      session,
      orchestratorImage,
      requestedLocale,
      history,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
      webSearchBlock,
      enrichedImages,
    } = prep;
    const text = input.text?.trim();
    const sanitizedText = this.piiSanitizer.sanitize(text ?? '').sanitizedText;

    const aiResult: OrchestratorOutput = await this.orchestrator.generate({
      history,
      text: sanitizedText,
      image: orchestratorImage,
      locale: requestedLocale,
      museumMode: input.context?.museumMode ?? session.museumMode,
      context: {
        location: input.context?.location,
        guideLevel: input.context?.guideLevel,
      },
      visitContext: session.visitContext,
      requestId,
      userMemoryBlock,
      knowledgeBaseBlock,
      webSearchBlock,
      audioDescriptionMode: input.context?.audioDescriptionMode,
      lowDataMode: input.context?.lowDataMode ?? false,
    });

    return await commitAssistantResponse(
      {
        guardrail: this.guardrail,
        repository: this.repository,
        cache: this.cache,
        userMemory: this.userMemory,
      },
      sessionId,
      session,
      aiResult,
      { requestedLocale, ownerId, enrichedImages },
    );
  }

  /** Posts a message with token-by-token streaming and incremental guardrail checks. */
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

    const {
      session,
      orchestratorImage,
      requestedLocale,
      history,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
      webSearchBlock,
      enrichedImages,
    } = prep;

    if (signal?.aborted) {
      throw new AppError({ message: 'Request aborted', statusCode: 499, code: 'ABORTED' });
    }

    const buffer = new StreamBuffer({
      classifier: this.artTopicClassifier,
      locale: requestedLocale,
      signal,
      onGuardrail,
    });
    buffer.onRelease(onToken);
    const sanitizedText = this.piiSanitizer.sanitize(input.text?.trim() ?? '').sanitizedText;

    const aiResult: OrchestratorOutput = await this.orchestrator.generateStream(
      {
        history,
        text: sanitizedText,
        image: orchestratorImage,
        locale: requestedLocale,
        museumMode: input.context?.museumMode ?? session.museumMode,
        context: { location: input.context?.location, guideLevel: input.context?.guideLevel },
        visitContext: session.visitContext,
        requestId,
        userMemoryBlock,
        knowledgeBaseBlock,
        webSearchBlock,
        audioDescriptionMode: input.context?.audioDescriptionMode,
        lowDataMode: input.context?.lowDataMode ?? false,
      },
      (chunk) => {
        buffer.push(chunk);
      },
    );

    buffer.finish();
    await buffer.awaitPhase1();
    await awaitDrainWithTimeout(buffer);

    return await commitAssistantResponse(
      {
        guardrail: this.guardrail,
        repository: this.repository,
        cache: this.cache,
        userMemory: this.userMemory,
      },
      sessionId,
      session,
      aiResult,
      { requestedLocale, ownerId, enrichedImages },
    );
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

function validateAudioInput(audio: PostAudioMessageInput['audio']): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: audio fields may be undefined from external API input
  if (!audio?.base64?.trim()) {
    throw badRequest('Audio payload is required');
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: mimeType may be undefined from external API input
  if (!audio.mimeType?.trim()) {
    throw badRequest('Audio mime type is required');
  }
  if (
    !Number.isFinite(audio.sizeBytes) ||
    audio.sizeBytes <= 0 ||
    audio.sizeBytes > env.llm.maxAudioBytes
  ) {
    throw badRequest(`Audio exceeds max size of ${String(env.llm.maxAudioBytes)} bytes`);
  }
  if (!env.upload.allowedAudioMimeTypes.includes(audio.mimeType)) {
    throw badRequest(`Unsupported audio mime type: ${audio.mimeType}`);
  }
}
