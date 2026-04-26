import { validate as isUuid } from 'uuid';

import { AppError, badRequest, notFound } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { buildCacheKey } from './chat-cache-key.util';
import { resolveLocalImageMeta } from './chat-image.helpers';
import { ensureMessageAccess } from './session-access';

import type { FeedbackMessageResult, ReportMessageResult } from './chat.service.types';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { ReportReason } from '../domain/chat.types';
import type { FeedbackValue } from '../domain/messageFeedback.entity';
import type { AudioStorage } from '../domain/ports/audio-storage.port';
import type { TextToSpeechService } from '../domain/ports/tts.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Dependencies for the media sub-service. */
interface ChatMediaServiceDeps {
  repository: ChatRepository;
  tts?: TextToSpeechService;
  cache?: CacheService;
  audioStorage?: AudioStorage;
}

/**
 * Handles media-related operations: image reference resolution, message reporting, and TTS synthesis.
 */
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

  /**
   * Resolves the image reference for a message, including local file name and content type when applicable.
   *
   * @param messageId - UUID of the message containing the image.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns The image reference, and optionally the local file name and content type.
   * @throws {AppError} 400 on invalid id, 404 if message or image not found.
   */
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

  /**
   * Resolves the image reference for a message when the caller has already proven authorization
   * via a verified HMAC token (see `verifySignedChatImageReadUrl`). Skips the session-ownership
   * check because the signed token IS the authorization — it was issued to the legitimate owner
   * and is short-lived.
   *
   * Path-only validation (UUID) is still enforced. Use this ONLY after HMAC + TTL verification.
   *
   * @param messageId - UUID of the message containing the image.
   * @returns The image reference, and optionally the local file name and content type.
   * @throws {AppError} 400 on invalid id, 404 if message or image not found.
   */
  async getMessageImageRefBySignedToken(messageId: string): Promise<{
    imageRef: string;
    fileName?: string;
    contentType?: string;
  }> {
    if (!isUuid(messageId)) {
      throw badRequest('Invalid message id format');
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

  /** Shared mapping of an `imageRef` storage string to the response shape. */
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

  /**
   * Reports an assistant message for moderation.
   *
   * @param messageId - UUID of the assistant message to report.
   * @param reason - Reason for the report (offensive, inaccurate, inappropriate, other).
   * @param currentUserId - Authenticated user id filing the report.
   * @param comment - Optional free-text comment.
   * @returns Confirmation that the message was reported.
   * @throws {AppError} 400 on invalid id/reason or non-assistant message, 404 if not found.
   */
  async reportMessage(
    messageId: string,
    reason: ReportReason,
    currentUserId: number,
    comment?: string,
  ): Promise<ReportMessageResult> {
    const allowedReasons: ReportReason[] = ['offensive', 'inaccurate', 'inappropriate', 'other'];
    if (!allowedReasons.includes(reason)) {
      throw badRequest('Invalid report reason');
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

  /**
   * Sets or toggles feedback (thumbs up/down) on an assistant message.
   * If the existing feedback matches the submitted value, it is removed (toggle off).
   *
   * @param messageId - UUID of the assistant message to rate.
   * @param currentUserId - Authenticated user id providing feedback.
   * @param value - Feedback value ('positive' or 'negative').
   * @returns The feedback status: 'created', 'updated', or 'removed'.
   * @throws {AppError} 400 on invalid id or non-assistant message, 404 if not found.
   */
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

  /** Invalidates the cached LLM response for the question that preceded this assistant message. Fail-open. */
  private async invalidateCacheForFeedback(
    messageId: string,
    row: Awaited<ReturnType<typeof ensureMessageAccess>>,
  ): Promise<void> {
    if (!this.cache) return;
    try {
      const history = await this.repository.listSessionHistory(row.message.sessionId, 50);
      const assistantIdx = history.findIndex((m) => m.id === messageId);
      const userMsg = assistantIdx > 0 ? history[assistantIdx - 1] : null;

      if (userMsg?.text && userMsg.role === 'user' && row.session.museumId) {
        // R1 hybrid scoping: best-effort delete BOTH the global and the
        // user-scoped key shapes the entry could have been written under.
        // At feedback time we don't know which shape was used (depends on
        // geo / attachments at write-time), so we del both.
        const ownerId = row.session.user?.id;
        const baseInput = {
          text: userMsg.text,
          museumId: String(row.session.museumId),
          locale: row.session.locale ?? 'fr',
          guideLevel: row.session.visitContext?.detectedExpertise ?? 'beginner',
          audioDescriptionMode: false,
        };
        const keys: string[] = [
          buildCacheKey({
            ...baseInput,
            hasHistory: false,
            hasAttachment: false,
            hasGeo: false,
          }),
        ];
        if (ownerId !== undefined) {
          keys.push(
            buildCacheKey({
              ...baseInput,
              userId: ownerId,
              hasHistory: false,
              hasAttachment: false,
              hasGeo: false,
            }),
          );
        }
        for (const key of keys) {
          await this.cache.del(key);
          logger.info('llm_cache_invalidated_by_feedback', {
            museumId: row.session.museumId,
            key,
          });
        }
      }
    } catch {
      // fail-open: cache invalidation failure must not affect the feedback response
    }
  }

  /**
   * Synthesizes speech from an assistant message's text content.
   *
   * Cache strategy (most-recent first):
   *   1. Redis hot cache (`tts:<messageId>`, default 1d) — sub-100ms repeat hits.
   *   2. (After fresh synth) Persists S3 audio reference + voice + timestamp on the
   *      `ChatMessage` row so downstream offline replay or pre-cache can reuse it.
   *      Persistence is fire-and-forget — TTS request always returns the buffer.
   *
   * @param messageId - UUID of the assistant message to synthesize.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns Audio buffer with content type, or null if the message has no text.
   * @throws {AppError} 400 if the message is not from the assistant.
   * @throws {AppError} 501 if TTS is not available.
   * @throws {AppError} 404 if message not found or not owned.
   */
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

    const targetVoice = env.tts.voice;

    const cacheKey = `tts:${messageId}`;
    if (this.cache) {
      const cached = await this.cache.get<{ audio: string; contentType: string }>(cacheKey);
      if (cached) {
        return { audio: Buffer.from(cached.audio, 'base64'), contentType: cached.contentType };
      }
    }

    const result = await this.tts.synthesize({ text: row.message.text, voice: targetVoice });

    if (this.cache) {
      await this.cache.set(
        cacheKey,
        { audio: result.audio.toString('base64'), contentType: result.contentType },
        env.tts.cacheTtlSeconds,
      );
    }

    if (this.audioStorage) {
      try {
        const ref = await this.audioStorage.save({
          buffer: result.audio,
          contentType: result.contentType,
        });
        await this.repository.updateMessageAudio(messageId, {
          audioUrl: ref,
          audioGeneratedAt: new Date(),
          audioVoice: targetVoice,
        });
      } catch (error: unknown) {
        // fail-open: audio persistence is best-effort, must not affect TTS response
        logger.warn('audio_storage_persist_failed', {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Returns a signed read URL for a message's cached TTS audio (if previously synthesized).
   *
   * Used by the mobile client to download audio directly from object storage,
   * bypassing the API server (offline cache, lock-screen replay, walks pre-fetch).
   *
   * @param messageId - UUID of the assistant message.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns Signed URL with expiry, or null if no cached audio exists or storage is not configured.
   */
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
