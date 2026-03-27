import { auditService } from '@shared/audit';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { OpenAiAudioTranscriber } from './adapters/secondary/audio-transcriber.openai';
import { S3CompatibleImageStorage } from './adapters/secondary/image-storage.s3';
import { LocalImageStorage } from './adapters/secondary/image-storage.stub';
import { LangChainChatOrchestrator } from './adapters/secondary/langchain.orchestrator';
import { TesseractOcrService, DisabledOcrService } from './adapters/secondary/ocr-service';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from './adapters/secondary/text-to-speech.openai';
import { WikidataClient } from './adapters/secondary/wikidata.client';
import { ArtTopicClassifier } from './application/art-topic-classifier';
import { ChatService } from './application/chat.service';
import { KnowledgeBaseService } from './application/knowledge-base.service';
import { UserMemoryService } from './application/user-memory.service';
import { TypeOrmArtKeywordRepository } from './infrastructure/artKeyword.repository.typeorm';
import { TypeOrmChatRepository } from './infrastructure/chat.repository.typeorm';
import { TypeOrmUserMemoryRepository } from './infrastructure/userMemory.repository.typeorm';

import type { ArtKeywordRepository } from './domain/artKeyword.repository.interface';
import type { OcrService } from './domain/ports/ocr.port';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

/** Lazily-initialized image storage singleton, shared with the auth module for GDPR cleanup. */
let sharedImageStorage: LocalImageStorage | S3CompatibleImageStorage | undefined;

/** Returns the shared image storage instance (available after buildChatService has been called). */
export const getImageStorage = (): LocalImageStorage | S3CompatibleImageStorage | undefined =>
  sharedImageStorage;

/** Lazily-initialized chat repository singleton, shared with the auth module for GDPR data export. */
let sharedRepository: TypeOrmChatRepository | undefined;

/** Returns the shared chat repository instance (available after buildChatService has been called). */
export const getChatRepository = (): TypeOrmChatRepository | undefined => sharedRepository;

/** Lazily-initialized OCR service singleton, exposed for graceful shutdown (worker pool cleanup). */
let ocrServiceRef: OcrService | undefined;

/** Returns the shared OCR service instance (available after buildChatService has been called). */
export const getOcrService = (): OcrService | undefined => ocrServiceRef;

/** Lazily-initialized user-memory service singleton, shared with the auth module for GDPR cleanup. */
let sharedUserMemoryService: UserMemoryService | undefined;

/** Returns the shared user-memory service instance (available after buildChatService has been called). */
export const getUserMemoryService = (): UserMemoryService | undefined => sharedUserMemoryService;

let sharedArtKeywordRepository: ArtKeywordRepository | undefined;
export const getArtKeywordRepository = (): ArtKeywordRepository | undefined =>
  sharedArtKeywordRepository;

let artKeywordsRefreshTimer: ReturnType<typeof setInterval> | undefined;
export const getArtKeywordsRefreshTimer = (): ReturnType<typeof setInterval> | undefined =>
  artKeywordsRefreshTimer;

/**
 * Wires the chat module dependency graph and returns a fully configured ChatService.
 *
 * @param dataSource - Initialized TypeORM DataSource for repository creation.
 * @returns ChatService with repository, orchestrator, image storage, and audio transcriber.
 */
// eslint-disable-next-line complexity, max-lines-per-function -- dependency wiring requires conditional initialization of storage, audio, OCR, KB, and memory services
export const buildChatService = (dataSource: DataSource, cache?: CacheService): ChatService => {
  let imageStorage: LocalImageStorage | S3CompatibleImageStorage;
  if (env.storage.driver === 's3') {
    const s3 = env.storage.s3;
    if (!s3?.endpoint || !s3.region || !s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
      throw new Error(
        'OBJECT_STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      );
    }

    imageStorage = new S3CompatibleImageStorage({
      endpoint: s3.endpoint,
      region: s3.region,
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      signedUrlTtlSeconds: env.storage.signedUrlTtlSeconds,
      publicBaseUrl: s3.publicBaseUrl,
      sessionToken: s3.sessionToken,
      objectKeyPrefix: s3.objectKeyPrefix,
      requestTimeoutMs: env.requestTimeoutMs,
    });
  } else {
    imageStorage = new LocalImageStorage(env.storage.localUploadsDir);
  }

  sharedImageStorage = imageStorage;

  const repository = new TypeOrmChatRepository(dataSource);
  sharedRepository = repository;

  const tts =
    env.tts?.enabled && env.llm.openAiApiKey
      ? new OpenAiTextToSpeechService()
      : new DisabledTextToSpeechService();

  const ocr = env.featureFlags.ocrGuard ? new TesseractOcrService() : new DisabledOcrService();
  ocrServiceRef = ocr;

  let userMemory: UserMemoryService | undefined;
  if (env.featureFlags.userMemory) {
    const userMemoryRepo = new TypeOrmUserMemoryRepository(dataSource);
    userMemory = new UserMemoryService(userMemoryRepo, cache);
    sharedUserMemoryService = userMemory;
  }

  let knowledgeBase: KnowledgeBaseService | undefined;
  if (env.featureFlags.knowledgeBase) {
    const wikidataClient = new WikidataClient();
    knowledgeBase = new KnowledgeBaseService(wikidataClient, {
      timeoutMs: env.knowledgeBase.timeoutMs,
      cacheTtlSeconds: env.knowledgeBase.cacheTtlSeconds,
      cacheMaxEntries: env.knowledgeBase.cacheMaxEntries,
    });
  }

  const artKeywordRepo = new TypeOrmArtKeywordRepository(dataSource);
  sharedArtKeywordRepository = artKeywordRepo;

  let artTopicClassifier: ArtTopicClassifier | undefined;
  if (env.llm.openAiApiKey) {
    artTopicClassifier = new ArtTopicClassifier(env.llm.openAiApiKey);
  }

  const dynamicArtKeywords = new Set<string>();
  const refreshKeywords = async () => {
    try {
      const rows = await artKeywordRepo.findByLocale('%');
      dynamicArtKeywords.clear();
      for (const row of rows) {
        dynamicArtKeywords.add(row.keyword);
      }
    } catch (error) {
      logger.warn('art_keywords_refresh_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  void refreshKeywords();
  artKeywordsRefreshTimer = setInterval(() => void refreshKeywords(), 5 * 60 * 1000);

  const onArtKeywordDiscovered = (keyword: string, locale: string) => {
    const normalized = keyword.toLowerCase().trim();
    if (!normalized || dynamicArtKeywords.has(normalized)) return;
    dynamicArtKeywords.add(normalized);
    void artKeywordRepo.upsert(normalized, locale).catch(() => {
      /* fire-and-forget */
    });
  };

  return new ChatService({
    repository,
    orchestrator: new LangChainChatOrchestrator(),
    imageStorage,
    audioTranscriber: new OpenAiAudioTranscriber(),
    tts,
    cache,
    ocr,
    audit: auditService,
    userMemory,
    knowledgeBase,
    dynamicArtKeywords,
    artTopicClassifier,
    onArtKeywordDiscovered,
  });
};
