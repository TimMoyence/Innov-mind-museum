import { validate as isUuid } from 'uuid';

import { resolveLocalImageMeta } from '@modules/chat/useCase/image/chat-image.helpers';
import { ensureMessageAccess } from '@modules/chat/useCase/session/session-access';
import { AppError, badRequest, invalidInput, notFound } from '@shared/errors/app.error';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { deriveTier } from '@shared/observability/derive-tier';
import { env } from '@src/config/env';

import type { ReportReason } from '@modules/chat/domain/chat.types';
import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';
import type { AudioStorage } from '@modules/chat/domain/ports/audio-storage.port';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type {
  FeedbackMessageResult,
  ReportMessageResult,
} from '@modules/chat/useCase/orchestration/chat.service.types';
import type { CacheService } from '@shared/cache/cache.port';

interface ChatMediaServiceDeps {
  repository: ChatRepository;
  tts?: TextToSpeechService;
  cache?: CacheService;
  audioStorage?: AudioStorage;
}

export class ChatMediaService {
  private readonly repository: ChatRepository;
  private readonly tts?: TextToSpeechService;
  private readonly cache?: CacheService;
  private readonly audioStorage?: AudioStorage;

  constructor(deps: ChatMediaServiceDeps) {
    this.repository = deps.repository;
    this.tts = deps.tts;
    this.cache = deps.cache;
    this.audioStorage = deps.audioStorage;
  }

  async getMessageImageRef(
    messageId: string,
    currentUserId?: number,
  ): Promise<{
    imageRef: string;
    fileName?: string;
    contentType?: string;
  }> {
    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (!row.message.imageRef) {
      throw notFound('Chat message image not found');
    }

    return this.toImageRefResult(row.message.imageRef);
  }

  async getMessageImageRefBySignedToken(messageId: string): Promise<{
    imageRef: string;
    fileName?: string;
    contentType?: string;
  }> {
    if (!isUuid(messageId)) {
      throw invalidInput('Invalid message id format');
    }

    const row = await this.repository.getMessageById(messageId);
    if (!row) {
      throw notFound('Chat message not found');
    }

    if (!row.message.imageRef) {
      throw notFound('Chat message image not found');
    }

    return this.toImageRefResult(row.message.imageRef);
  }

  private toImageRefResult(imageRef: string): {
    imageRef: string;
    fileName?: string;
    contentType?: string;
  } {
    const localMeta = resolveLocalImageMeta(imageRef);
    if (localMeta) {
      return { imageRef, ...localMeta };
    }

    return { imageRef };
  }

  async reportMessage(
    messageId: string,
    reason: ReportReason,
    currentUserId: number,
    comment?: string,
  ): Promise<ReportMessageResult> {
    const allowedReasons: ReportReason[] = ['offensive', 'inaccurate', 'inappropriate', 'other'];
    if (!allowedReasons.includes(reason)) {
      throw invalidInput('Invalid report reason');
    }

    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (row.message.role !== 'assistant') {
      throw badRequest('Only assistant messages can be reported');
    }

    const alreadyReported = await this.repository.hasMessageReport(messageId, currentUserId);
    if (alreadyReported) {
      return { messageId, reported: true };
    }

    await this.repository.persistMessageReport({
      messageId,
      userId: currentUserId,
      reason,
      comment,
    });

    return { messageId, reported: true };
  }

  async setMessageFeedback(
    messageId: string,
    currentUserId: number,
    value: FeedbackValue,
  ): Promise<FeedbackMessageResult> {
    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (row.message.role !== 'assistant') {
      throw badRequest('Only assistant messages can receive feedback');
    }

    const existing = await this.repository.getMessageFeedback(messageId, currentUserId);

    if (existing?.value === value) {
      await this.repository.deleteMessageFeedback(messageId, currentUserId);
      return { messageId, status: 'removed' };
    }

    await this.repository.upsertMessageFeedback(messageId, currentUserId, value);

    if (value === 'negative') {
      await this.invalidateCacheForFeedback(messageId, row);
    }

    return { messageId, status: existing ? 'updated' : 'created' };
  }

  private async invalidateCacheForFeedback(
    messageId: string,
    row: Awaited<ReturnType<typeof ensureMessageAccess>>,
  ): Promise<void> {
    if (!this.cache) return;
    const cache = this.cache;
    const cacheKey = row.message.cacheKey ?? null;
    const museumId = row.session.museumId ?? null;
    if (!cacheKey) {
      logger.info('llm_cache_invalidate_skipped', {
        messageId,
        museumId,
        reason: 'no_cache_key',
      });
      return;
    }
    try {
      await cache.del(cacheKey);
      logger.info('llm_cache_invalidated_by_feedback', { messageId, museumId, key: cacheKey });
    } catch (err: unknown) {
      logger.warn('llm_cache_invalidate_failed', {
        messageId,
        museumId,
        key: cacheKey,
        error: errorMessage(err),
      });
    }
  }

  async synthesizeSpeech(
    messageId: string,
    currentUserId?: number,
  ): Promise<{ audio: Buffer; contentType: string } | null> {
    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (row.message.role !== 'assistant') {
      throw badRequest('TTS is only available for assistant messages');
    }

    if (!row.message.text?.trim()) {
      return null;
    }

    if (!this.tts) {
      throw new AppError({
        message: 'Text-to-speech is not available',
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    }

    const targetVoice = row.session.user?.ttsVoice ?? env.tts.voice;

    const cacheKey = `tts:v2:${messageId}:${targetVoice}`;
    if (this.cache) {
      const cached = await this.cache.get<{ audio: string; contentType: string }>(cacheKey);
      if (cached) {
        return { audio: Buffer.from(cached.audio, 'base64'), contentType: cached.contentType };
      }
    }

    const result = await this.tts.synthesize({
      text: row.message.text,
      voice: targetVoice,
      requestId: messageId,
      ...(row.session.museumId != null ? { museumId: row.session.museumId } : {}),
      tier: deriveTier(row.session.user?.id),
    });

    if (this.cache) {
      await this.cache.set(
        cacheKey,
        { audio: result.audio.toString('base64'), contentType: result.contentType },
        env.tts.cacheTtlSeconds,
      );
    }

    if (this.audioStorage) {
      const audioStorage = this.audioStorage;
      const repository = this.repository;
      const audioBuffer = result.audio;
      const audioContentType = result.contentType;
      void (async () => {
        try {
          const ref = await audioStorage.save({
            buffer: audioBuffer,
            contentType: audioContentType,
          });
          await repository.updateMessageAudio(messageId, {
            audioUrl: ref,
            audioGeneratedAt: new Date(),
            audioVoice: targetVoice,
          });
        } catch (error: unknown) {
          logger.warn('audio_storage_persist_failed', {
            messageId,
            error: errorMessage(error),
          });
        }
      })();
    }

    return result;
  }

  async getMessageAudioUrl(
    messageId: string,
    currentUserId?: number,
  ): Promise<{ url: string; expiresAt: string; voice: string; generatedAt: string } | null> {
    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (row.message.role !== 'assistant') {
      throw badRequest('Audio URL is only available for assistant messages');
    }

    if (!row.message.audioUrl || !this.audioStorage) {
      return null;
    }

    const signed = await this.audioStorage.getSignedReadUrl(row.message.audioUrl);
    if (!signed) {
      return null;
    }

    return {
      url: signed.url,
      expiresAt: signed.expiresAt,
      voice: row.message.audioVoice ?? env.tts.voice,
      generatedAt: row.message.audioGeneratedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }
}
