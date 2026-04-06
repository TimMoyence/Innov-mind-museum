import { AppError, badRequest, notFound } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { resolveLocalImageMeta } from './chat-image.helpers';
import { ensureMessageAccess } from './session-access';

import type { FeedbackMessageResult, ReportMessageResult } from './chat.service.types';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { ReportReason } from '../domain/chat.types';
import type { FeedbackValue } from '../domain/messageFeedback.entity';
import type { TextToSpeechService } from '../domain/ports/tts.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Dependencies for the media sub-service. */
interface ChatMediaServiceDeps {
  repository: ChatRepository;
  tts?: TextToSpeechService;
  cache?: CacheService;
}

/**
 * Handles media-related operations: image reference resolution, message reporting, and TTS synthesis.
 */
export class ChatMediaService {
  private readonly repository: ChatRepository;
  private readonly tts?: TextToSpeechService;
  private readonly cache?: CacheService;

  constructor(deps: ChatMediaServiceDeps) {
    this.repository = deps.repository;
    this.tts = deps.tts;
    this.cache = deps.cache;
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

    const localMeta = resolveLocalImageMeta(row.message.imageRef);
    if (localMeta) {
      return { imageRef: row.message.imageRef, ...localMeta };
    }

    return {
      imageRef: row.message.imageRef,
    };
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
    return { messageId, status: existing ? 'updated' : 'created' };
  }

  /**
   * Synthesizes speech from an assistant message's text content.
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

    const cacheKey = `tts:${messageId}`;
    if (this.cache) {
      const cached = await this.cache.get<{ audio: string; contentType: string }>(cacheKey);
      if (cached) {
        return { audio: Buffer.from(cached.audio, 'base64'), contentType: cached.contentType };
      }
    }

    const result = await this.tts.synthesize({ text: row.message.text });

    if (this.cache) {
      await this.cache.set(
        cacheKey,
        { audio: result.audio.toString('base64'), contentType: result.contentType },
        env.tts?.cacheTtlSeconds ?? 86400,
      );
    }

    return result;
  }
}
