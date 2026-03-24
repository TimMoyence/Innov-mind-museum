import { env } from '@src/config/env';
import { DataSource } from 'typeorm';
import { auditService } from '@shared/audit';

import { ChatService } from './application/chat.service';
import { UserMemoryService } from './application/user-memory.service';
import { LangChainChatOrchestrator } from './adapters/secondary/langchain.orchestrator';
import { LocalImageStorage } from './adapters/secondary/image-storage.stub';
import { S3CompatibleImageStorage } from './adapters/secondary/image-storage.s3';
import { OpenAiAudioTranscriber } from './adapters/secondary/audio-transcriber.openai';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from './adapters/secondary/text-to-speech.openai';
import {
  TesseractOcrService,
  DisabledOcrService,
} from './adapters/secondary/ocr-service';
import type { OcrService } from './domain/ports/ocr.port';
import { TypeOrmChatRepository } from './infrastructure/chat.repository.typeorm';
import { TypeOrmUserMemoryRepository } from './infrastructure/userMemory.repository.typeorm';
import type { CacheService } from '@shared/cache/cache.port';

/** Lazily-initialized image storage singleton, shared with the auth module for GDPR cleanup. */
let sharedImageStorage: LocalImageStorage | S3CompatibleImageStorage | undefined;

/** Returns the shared image storage instance (available after buildChatService has been called). */
export const getImageStorage = (): LocalImageStorage | S3CompatibleImageStorage | undefined => sharedImageStorage;

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

/**
 * Wires the chat module dependency graph and returns a fully configured ChatService.
 * @param dataSource - Initialized TypeORM DataSource for repository creation.
 * @returns ChatService with repository, orchestrator, image storage, and audio transcriber.
 */
export const buildChatService = (dataSource: DataSource, cache?: CacheService): ChatService => {
  let imageStorage: LocalImageStorage | S3CompatibleImageStorage;
  if (env.storage.driver === 's3') {
    const s3 = env.storage.s3;
    if (
      !s3?.endpoint ||
      !s3.region ||
      !s3.bucket ||
      !s3.accessKeyId ||
      !s3.secretAccessKey
    ) {
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

  const tts = env.tts?.enabled && env.llm.openAiApiKey
    ? new OpenAiTextToSpeechService()
    : new DisabledTextToSpeechService();

  const ocr = env.featureFlags.ocrGuard
    ? new TesseractOcrService()
    : new DisabledOcrService();
  ocrServiceRef = ocr;

  let userMemory: UserMemoryService | undefined;
  if (env.featureFlags.userMemory) {
    const userMemoryRepo = new TypeOrmUserMemoryRepository(dataSource);
    userMemory = new UserMemoryService(userMemoryRepo, cache);
    sharedUserMemoryService = userMemory;
  }

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
  });
};
