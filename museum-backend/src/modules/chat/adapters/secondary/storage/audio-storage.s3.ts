import { randomUUID } from 'node:crypto';

import { startSpan } from '@shared/observability/sentry';

import { buildS3PresignedReadUrl, type S3ImageStorageConfig } from './s3-operations';
import { buildS3SignedHeadersForPut, deleteObjectsBatch, httpPut } from './s3-operations';
import { normalizeObjectKey } from './s3-path-utils';

import type {
  AudioStorage,
  SaveAudioInput,
  SignedAudioReadUrl,
} from '@modules/chat/domain/ports/audio-storage.port';

/** TTS audio reuses the same S3 backend as images. */
export type S3AudioStorageConfig = S3ImageStorageConfig;

const AUDIO_PREFIX = 'chat-audios';

const extensionByContentType: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

export const parseS3AudioRef = (ref: string): { key: string } | null => {
  const match = /^s3:\/\/(.+)$/.exec(ref);
  if (!match?.[1]) return null;
  return { key: match[1] };
};

export const buildS3AudioRef = (key: string): string => `s3://${key}`;

export class S3CompatibleAudioStorage implements AudioStorage {
  constructor(private readonly config: S3AudioStorageConfig) {}

  async save(input: SaveAudioInput): Promise<string> {
    return await startSpan({ name: 'audio.upload.s3', op: 'storage.upload' }, async () => {
      const extension = extensionByContentType[input.contentType] ?? 'mp3';
      const now = new Date();
      const fallbackKey = [
        AUDIO_PREFIX,
        String(now.getUTCFullYear()),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        `${randomUUID()}.${extension}`,
      ].join('/');
      const key = normalizeObjectKey({
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        key: input.objectKey || fallbackKey,
        objectKeyPrefix: this.config.objectKeyPrefix,
      });

      const signed = buildS3SignedHeadersForPut({
        config: this.config,
        key,
        body: input.buffer,
        contentType: input.contentType,
        now,
      });

      await httpPut({
        url: signed.url,
        headers: signed.headers,
        body: input.buffer,
        timeoutMs: this.config.requestTimeoutMs,
      });

      return buildS3AudioRef(key);
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- buildS3PresignedReadUrl is synchronous; async required by AudioStorage interface
  async getSignedReadUrl(ref: string, ttlSeconds?: number): Promise<SignedAudioReadUrl | null> {
    const parsed = parseS3AudioRef(ref);
    if (!parsed) return null;
    return buildS3PresignedReadUrl({
      key: parsed.key,
      config: this.config,
      ttlSeconds,
    });
  }

  /** No-op if ref is invalid or not found. */
  async deleteByRef(ref: string): Promise<void> {
    const parsed = parseS3AudioRef(ref);
    if (!parsed) return;
    await deleteObjectsBatch(this.config, [parsed.key]);
  }
}
