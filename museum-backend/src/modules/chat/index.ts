import { env } from '@src/config/env';
import { DataSource } from 'typeorm';

import { ChatService } from './application/chat.service';
import { LangChainChatOrchestrator } from './adapters/secondary/langchain.orchestrator';
import { LocalImageStorage } from './adapters/secondary/image-storage.stub';
import { S3CompatibleImageStorage } from './adapters/secondary/image-storage.s3';
import { OpenAiAudioTranscriber } from './adapters/secondary/audio-transcriber.openai';
import { TypeOrmChatRepository } from './infrastructure/chat.repository.typeorm';

/** Lazily-initialized image storage singleton, shared with the auth module for GDPR cleanup. */
let sharedImageStorage: LocalImageStorage | S3CompatibleImageStorage | undefined;

/** Returns the shared image storage instance (available after buildChatService has been called). */
export const getImageStorage = (): LocalImageStorage | S3CompatibleImageStorage | undefined => sharedImageStorage;

/**
 * Wires the chat module dependency graph and returns a fully configured ChatService.
 * @param dataSource - Initialized TypeORM DataSource for repository creation.
 * @returns ChatService with repository, orchestrator, image storage, and audio transcriber.
 */
export const buildChatService = (dataSource: DataSource): ChatService => {
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

  return new ChatService(
    new TypeOrmChatRepository(dataSource),
    new LangChainChatOrchestrator(),
    imageStorage,
    new OpenAiAudioTranscriber(),
  );
};
