import { validate as isUuid } from 'uuid';

import { resolveLocalImageMeta } from '@modules/chat/useCase/image/chat-image.helpers';
import { buildCacheKey } from '@modules/chat/useCase/message/chat-cache-key.util';
import { ensureMessageAccess } from '@modules/chat/useCase/session/session-access';
import { AppError, badRequest, notFound } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { deriveTier } from '@shared/observability/derive-tier';
import { env } from '@src/config/env';

import type { ReportReason } from '@modules/chat/domain/chat.types';
import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';
import type { AudioStorage } from '@modules/chat/domain/ports/audio-storage.port';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
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

  /** @throws {AppError} 400 invalid id, 404 message/image not found. */
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
   * Skips session-ownership: signed HMAC token IS authorization (short-lived,
   * issued to legitimate owner). Use ONLY after `verifySignedChatImageReadUrl`.
   * UUID path validation still enforced.
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

  /** Submitting same value as existing toggles it off. */
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

  /**
   * Fail-open: invalidates LLM cache for the question preceding this assistant msg.
   *
   * F2 (2026-05-19) — write-time shape (audioDescriptionMode × voiceMode) is
   * unknown at feedback time, so we iterate the full 4-shape cartesian
   * (`{false,true}²`) across both namespaces (global + user-scoped when owner
   * present) — 4 or 8 `del` calls. Per-key try/catch ensures a single Redis
   * hiccup does not skip the remaining keys (F2.3 partial-failure resilience).
   */
  private async invalidateCacheForFeedback(
    messageId: string,
    row: Awaited<ReturnType<typeof ensureMessageAccess>>,
  ): Promise<void> {
    if (!this.cache) return;
    const cache = this.cache;
    try {
      const userMsg = await this.findPrecedingUserMessage(row.message.sessionId, messageId);
      if (!userMsg?.text || userMsg.role !== 'user' || !row.session.museumId) return;
      const keys = buildFeedbackInvalidationKeys(userMsg.text, row.session);
      for (const key of keys) {
        await safeCacheDel(cache, key, row.session.museumId);
      }
    } catch {
      // fail-open: invalidation failure must not affect feedback response
    }
  }

  private async findPrecedingUserMessage(
    sessionId: string,
    assistantMessageId: string,
  ): Promise<{ role: string; text?: string | null } | null> {
    const history = await this.repository.listSessionHistory(sessionId, 50);
    const assistantIdx = history.findIndex((m) => m.id === assistantMessageId);
    return assistantIdx > 0 ? history[assistantIdx - 1] : null;
  }

  /**
   * Cache: Redis `tts:v2:<messageId>:<voiceId>` (default 1d) → fresh synth +
   * fire-and-forget S3 persistence (audioUrl + voice + ts) on ChatMessage for
   * offline replay / walk pre-fetch. `v2` prefix bumped 2026-05-17 to make the
   * key voice-aware (correctness fix TD-28).
   *
   * @throws {AppError} 400 not assistant, 501 TTS unavailable, 404 not found/owned.
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

    const targetVoice = row.session.user?.ttsVoice ?? env.tts.voice;

    const cacheKey = `tts:v2:${messageId}:${targetVoice}`;
    if (this.cache) {
      const cached = await this.cache.get<{ audio: string; contentType: string }>(cacheKey);
      if (cached) {
        return { audio: Buffer.from(cached.audio, 'base64'), contentType: cached.contentType };
      }
    }

    // TD-20 (R13a/R12) — per-tenant scope for the TTS-via-chat-media cost path.
    // `museumId` spread-omit (absent => key omitted, never `null`); `tier`
    // derived from the session owner via the shared `deriveTier`.
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

    // Decoupled persistence (C9.12b 2026-05-17) — don't block the TTS response on
    // S3 save + DB updateMessageAudio. Existing fail-open semantic preserved
    // inside the detached promise; failures only emit a warn log.
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
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    }

    return result;
  }

  /** Direct object-storage download (offline cache, lock-screen, walk pre-fetch). */
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

/**
 * F2 cartesian — build 4 shapes × 2 namespaces (global + user-scoped if owner).
 * Each call to buildCacheKey is pure, no I/O — safe to fan out.
 */
function buildFeedbackInvalidationKeys(userText: string, session: ChatSession): string[] {
  const ownerId = session.user?.id;
  const baseInput = {
    text: userText,
    museumId: String(session.museumId),
    locale: session.locale ?? 'fr',
    guideLevel: session.visitContext?.detectedExpertise ?? 'beginner',
    hasHistory: false,
    hasAttachment: false,
    hasGeo: false,
  } as const;
  const namespaces: { userId?: number }[] = [{}];
  if (ownerId !== undefined) namespaces.push({ userId: ownerId });
  const keys: string[] = [];
  for (const ns of namespaces) {
    for (const audioDescriptionMode of [false, true]) {
      for (const voiceMode of [false, true]) {
        keys.push(buildCacheKey({ ...baseInput, ...ns, audioDescriptionMode, voiceMode }));
      }
    }
  }
  return keys;
}

/**
 * F2.3 — per-key fail-open. A single Redis hiccup MUST NOT skip remaining
 * keys in the cartesian. The outer try/catch in invalidateCacheForFeedback
 * catches non-cache failures (e.g. listSessionHistory rejection).
 */
async function safeCacheDel(cache: CacheService, key: string, museumId: number): Promise<void> {
  try {
    await cache.del(key);
    logger.info('llm_cache_invalidated_by_feedback', { museumId, key });
  } catch (err: unknown) {
    logger.warn('llm_cache_invalidate_failed', {
      museumId,
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
