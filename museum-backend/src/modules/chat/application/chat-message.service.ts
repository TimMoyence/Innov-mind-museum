/* eslint-disable max-lines -- message service orchestrates text/image/audio/stream posting with guardrails, already split from session and media sub-services */
import { AppError, badRequest, conflict } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';
import { env } from '@src/config/env';

import { evaluateUserInputGuardrail } from './art-topic-guardrail';
import { GuardrailEvaluationService } from './guardrail-evaluation.service';
import { ImageProcessingService } from './image-processing.service';
import { ensureSessionAccess } from './session-access';
import { computeSessionUpdates } from './visit-context';
import { DisabledAudioTranscriber } from '../domain/ports/audio-transcriber.port';

import type { ArtTopicClassifier } from './art-topic-classifier';
import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { PostMessageResult, PostAudioMessageResult } from './chat.service.types';
import type { ImageEnrichmentService } from './image-enrichment.service';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type { UserMemoryService } from './user-memory.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { EnrichedImage, PostAudioMessageInput, PostMessageInput } from '../domain/chat.types';
import type { AudioTranscriber } from '../domain/ports/audio-transcriber.port';
import type { ChatOrchestrator, OrchestratorOutput } from '../domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '../domain/ports/image-storage.port';
import type { ArtworkFacts } from '../domain/ports/knowledge-base.port';
import type { OcrService } from '../domain/ports/ocr.port';
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
  dynamicArtKeywords?: ReadonlySet<string>;
  artTopicClassifier?: ArtTopicClassifier;
  onArtKeywordDiscovered?: (keyword: string, locale: string) => void;
}

/**
 * Extracts a search term for knowledge base lookup from conversation history or input text.
 * Searches for the last assistant message with a detected artwork title, falling back to input text if 3+ words.
 */
function extractSearchTerm(
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText?: string,
): string | null {
  // Search history for last assistant message with detectedArtwork.title
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.metadata) {
      const meta = msg.metadata as { detectedArtwork?: { title?: string } };
      if (meta.detectedArtwork?.title) {
        return meta.detectedArtwork.title;
      }
    }
  }
  // Fallback: use input text if it has 3+ words
  if (inputText && inputText.split(/\s+/).length >= 3) {
    return inputText;
  }
  return null;
}

/** Successful preparation result with all data needed to invoke the LLM. */
interface PrepareReady {
  kind: 'ready';
  session: Awaited<ReturnType<typeof ensureSessionAccess>>;
  imageRef?: string;
  orchestratorImage?: PostMessageInput['image'];
  requestedLocale?: string;
  history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>;
  redirectHint?: string;
  ownerId?: number;
  userMemoryBlock?: string;
  knowledgeBaseBlock?: string;
  enrichedImages?: EnrichedImage[];
}

/** Guardrail-refused preparation result. */
interface PrepareRefused {
  kind: 'refused';
  result: PostMessageResult;
}

type PrepareResult = PrepareReady | PrepareRefused;

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

  constructor(deps: ChatMessageServiceDeps) {
    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();
    this.cache = deps.cache;
    this.userMemory = deps.userMemory;
    this.knowledgeBase = deps.knowledgeBase;
    this.imageEnrichment = deps.imageEnrichment;

    this.imageProcessor = new ImageProcessingService({
      imageStorage: deps.imageStorage,
      ocr: deps.ocr,
    });

    this.guardrail = new GuardrailEvaluationService({
      repository: deps.repository,
      audit: deps.audit,
      dynamicArtKeywords: deps.dynamicArtKeywords,
      artTopicClassifier: deps.artTopicClassifier,
      onArtKeywordDiscovered: deps.onArtKeywordDiscovered,
    });
  }

  /** Fetches user memory, knowledge-base text, KB facts, and image enrichment in parallel (fail-open). */
  private async fetchEnrichmentData(
    history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>,
    inputText: string | undefined,
    ownerId: number | undefined,
  ): Promise<{
    userMemoryBlock: string;
    knowledgeBaseBlock: string;
    enrichedImages: EnrichedImage[];
  }> {
    let userMemoryBlock = '';
    let knowledgeBaseBlock = '';
    let enrichedImages: EnrichedImage[] = [];

    const searchTerm = extractSearchTerm(history, inputText);
    let kbFacts: ArtworkFacts | null = null;

    await Promise.all([
      this.userMemory && ownerId
        ? this.userMemory
            .getMemoryForPrompt(ownerId)
            .then((b: string) => {
              userMemoryBlock = b;
            })
            .catch(() => {
              /* fail-open */
            })
        : Promise.resolve(),
      this.knowledgeBase && searchTerm
        ? this.knowledgeBase
            .lookup(searchTerm)
            .then((b: string) => {
              knowledgeBaseBlock = b;
            })
            .catch(() => {
              /* fail-open */
            })
        : Promise.resolve(),
      this.knowledgeBase && this.imageEnrichment && searchTerm
        ? this.knowledgeBase
            .lookupFacts(searchTerm)
            .then((facts) => {
              kbFacts = facts;
            })
            .catch(() => {
              /* fail-open */
            })
        : Promise.resolve(),
      this.imageEnrichment && searchTerm
        ? this.imageEnrichment
            .enrich(searchTerm)
            .then((imgs) => {
              enrichedImages = imgs;
            })
            .catch(() => {
              /* fail-open */
            })
        : Promise.resolve(),
    ]);

    // Merge Wikidata image into enriched images if KB returned a P18 imageUrl
    const resolvedFacts = kbFacts as ArtworkFacts | null;
    if (resolvedFacts?.imageUrl && this.imageEnrichment && searchTerm) {
      enrichedImages = this.imageEnrichment.mergeWikidataImage(
        enrichedImages,
        resolvedFacts.imageUrl,
        searchTerm,
      );
    }

    return { userMemoryBlock, knowledgeBaseBlock, enrichedImages };
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
    const historyBeforeMessage = await this.repository.listSessionHistory(
      sessionId,
      env.llm.maxHistoryMessages,
    );

    const userGuardrail = await this.guardrail.evaluateInput(
      text,
      historyBeforeMessage,
      requestedLocale,
    );

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
    const { userMemoryBlock, knowledgeBaseBlock, enrichedImages } = await this.fetchEnrichmentData(
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
      redirectHint: userGuardrail.redirectHint,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
      enrichedImages,
    };
  }

  /** Builds session updates and artwork match from the guardrail output and LLM result. */
  private buildCommitPayload(
    session: Awaited<ReturnType<typeof ensureSessionAccess>>,
    outputCheck: ReturnType<GuardrailEvaluationService['evaluateOutput']>,
    aiResult: OrchestratorOutput,
    requestedLocale: string | undefined,
    enrichedImages?: EnrichedImage[],
  ) {
    const assistantMetadata = outputCheck.metadata;

    if (enrichedImages && enrichedImages.length > 0) {
      assistantMetadata.images = enrichedImages;
    }

    const baseSessionUpdates = outputCheck.allowed
      ? computeSessionUpdates(session, assistantMetadata, 'pending')
      : undefined;

    const normalizedLocale = requestedLocale ? resolveLocale([requestedLocale]) : undefined;
    const localeChanged = normalizedLocale && normalizedLocale !== resolveLocale([session.locale]);
    const sessionUpdates = localeChanged
      ? { ...baseSessionUpdates, locale: normalizedLocale }
      : baseSessionUpdates;

    const artworkMatch =
      outputCheck.allowed && aiResult.metadata.detectedArtwork
        ? {
            artworkId: aiResult.metadata.detectedArtwork.artworkId,
            title: aiResult.metadata.detectedArtwork.title,
            artist: aiResult.metadata.detectedArtwork.artist,
            confidence: aiResult.metadata.detectedArtwork.confidence,
            source: aiResult.metadata.detectedArtwork.source,
            room: aiResult.metadata.detectedArtwork.room,
          }
        : undefined;

    return { assistantText: outputCheck.text, assistantMetadata, sessionUpdates, artworkMatch };
  }

  /** Invalidates caches and triggers fire-and-forget user memory update. */
  private async postCommitSideEffects(
    sessionId: string,
    ownerId: number | undefined,
    sessionUpdates: ReturnType<typeof computeSessionUpdates> | undefined,
  ): Promise<void> {
    if (this.cache) {
      await this.cache.delByPrefix(`session:${sessionId}:`);
      if (ownerId) {
        await this.cache.delByPrefix(`sessions:user:${String(ownerId)}:`);
      }
    }

    if (this.userMemory && ownerId && sessionUpdates?.visitContext) {
      this.userMemory
        .updateAfterSession(ownerId, sessionUpdates.visitContext, sessionId)
        .catch(() => {
          // swallowed — user memory is non-critical
        });
    }
  }

  /**
   * Persists the assistant response and returns the result. Shared by postMessage and postMessageStream.
   */
  private async commitAssistantResponse(
    sessionId: string,
    session: Awaited<ReturnType<typeof ensureSessionAccess>>,
    aiResult: OrchestratorOutput,
    options: {
      requestedLocale: string | undefined;
      history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>;
      ownerId: number | undefined;
      enrichedImages?: EnrichedImage[];
    },
  ): Promise<PostMessageResult> {
    const { requestedLocale, history, ownerId, enrichedImages } = options;
    const outputCheck = this.guardrail.evaluateOutput({
      text: aiResult.text,
      history,
      metadata: aiResult.metadata,
      requestedLocale,
    });

    const { assistantText, assistantMetadata, sessionUpdates, artworkMatch } =
      this.buildCommitPayload(session, outputCheck, aiResult, requestedLocale, enrichedImages);

    let assistantMessage;
    try {
      assistantMessage = await this.repository.persistMessage({
        sessionId,
        role: 'assistant',
        text: assistantText,
        metadata: assistantMetadata as Record<string, unknown>,
        sessionUpdates,
        artworkMatch,
      });
    } catch (error) {
      if ((error as Error).name === 'OptimisticLockVersionMismatchError') {
        throw conflict('Session was modified concurrently');
      }
      throw error;
    }

    if (outputCheck.allowed && sessionUpdates?.visitContext) {
      const pendingArtwork = sessionUpdates.visitContext.artworksDiscussed.find(
        (a) => a.messageId === 'pending',
      );
      if (pendingArtwork) {
        pendingArtwork.messageId = assistantMessage.id;
      }
    }

    await this.postCommitSideEffects(sessionId, ownerId, sessionUpdates);

    return {
      sessionId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        text: assistantText,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
      metadata: assistantMetadata,
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
      redirectHint,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
      enrichedImages,
    } = prep;
    const text = input.text?.trim();

    const aiResult: OrchestratorOutput = await this.orchestrator.generate({
      history,
      text,
      image: orchestratorImage,
      locale: requestedLocale,
      museumMode: input.context?.museumMode ?? session.museumMode,
      context: {
        location: input.context?.location,
        guideLevel: input.context?.guideLevel,
      },
      visitContext: session.visitContext,
      requestId,
      redirectHint,
      userMemoryBlock,
      knowledgeBaseBlock,
    });

    return await this.commitAssistantResponse(sessionId, session, aiResult, {
      requestedLocale,
      history,
      ownerId,
      enrichedImages,
    });
  }

  /** Builds a chunk handler that strips [META] blocks and runs incremental guardrail checks. */
  private createStreamChunkHandler(opts: {
    history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>;
    requestedLocale?: string;
    onToken: (text: string) => void;
    onGuardrail?: (text: string, reason: GuardrailBlockReason) => void;
    signal?: AbortSignal;
  }): (chunk: string) => void {
    const { history, requestedLocale, onToken, onGuardrail, signal } = opts;
    let accumulated = '';
    let artSignalSeen = false;
    let metaStarted = false;
    const META_MARKER = '\n[META]';

    return (chunk: string) => {
      if (signal?.aborted) {
        throw new AppError({ message: 'Client disconnected', statusCode: 499, code: 'ABORTED' });
      }

      accumulated += chunk;

      let metaIdx = accumulated.indexOf(META_MARKER);
      if (metaIdx === -1) metaIdx = accumulated.indexOf('[META]');
      if (metaIdx !== -1) {
        if (!metaStarted) {
          metaStarted = true;
          const answerPartLen = metaIdx - (accumulated.length - chunk.length);
          if (answerPartLen > 0) onToken(chunk.slice(0, answerPartLen));
        }
        return;
      }

      if (!artSignalSeen && accumulated.length % 50 < chunk.length) {
        const guardrailResult = this.guardrail.evaluateOutput({
          text: accumulated,
          history,
          metadata: {},
          requestedLocale,
        });
        if (guardrailResult.allowed) {
          artSignalSeen = true;
        } else if (accumulated.length > 100 && onGuardrail) {
          onGuardrail(guardrailResult.text, 'unsafe_output');
        }
      }

      onToken(chunk);
    };
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
      redirectHint,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
      enrichedImages,
    } = prep;

    if (signal?.aborted) {
      throw new AppError({ message: 'Request aborted', statusCode: 499, code: 'ABORTED' });
    }

    const onChunk = this.createStreamChunkHandler({
      history,
      requestedLocale,
      onToken,
      onGuardrail,
      signal,
    });

    const aiResult: OrchestratorOutput = await this.orchestrator.generateStream(
      {
        history,
        text: input.text?.trim(),
        image: orchestratorImage,
        locale: requestedLocale,
        museumMode: input.context?.museumMode ?? session.museumMode,
        context: { location: input.context?.location, guideLevel: input.context?.guideLevel },
        visitContext: session.visitContext,
        requestId,
        redirectHint,
        userMemoryBlock,
        knowledgeBaseBlock,
      },
      onChunk,
    );

    return await this.commitAssistantResponse(sessionId, session, aiResult, {
      requestedLocale,
      history,
      ownerId,
      enrichedImages,
    });
  }

  /** Transcribes an audio message then delegates to postMessage for LLM processing. */
  async postAudioMessage(
    sessionId: string,
    input: PostAudioMessageInput,
    requestId?: string,
    currentUserId?: number,
  ): Promise<PostAudioMessageResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    const audio = input.audio;
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

    const transcription = await this.audioTranscriber.transcribe({
      base64: audio.base64,
      mimeType: audio.mimeType,
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
