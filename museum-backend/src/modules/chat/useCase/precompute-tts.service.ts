import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { ChatRepository } from '../domain/chat.repository.interface';
import type { AudioStorage } from '../domain/ports/audio-storage.port';
import type { TextToSpeechService } from '../domain/ports/tts.port';

/** Outcome of pre-computing TTS audio for a single message. */
export interface PrecomputeTtsResult {
  messageId: string;
  status: 'computed' | 'cached' | 'skipped' | 'error';
  audioUrl?: string;
  reason?: string;
}

/** Dependencies for the pre-compute TTS service. */
interface PrecomputeTtsServiceDeps {
  repository: ChatRepository;
  tts: TextToSpeechService;
  audioStorage: AudioStorage;
}

/**
 * Pre-computes and persists TTS audio for assistant messages **without** waiting for a
 * user-initiated synthesize request. Designed for two callers:
 *
 * 1. **Walk audio guides** (NL-10/NL-11) — pre-render every step's narration so mobile
 *    can `prefetchAll()` the whole tour before departure (offline-ready).
 * 2. **Admin CMS** (future route) — manually re-generate audio after editing a curated message.
 *
 * Reuses the same TTS + AudioStorage adapters as {@link ChatMediaService.synthesizeSpeech}
 * so the audio bytes and storage layout are byte-identical between fresh + pre-computed.
 */
export class PrecomputeTtsService {
  private readonly repository: ChatRepository;
  private readonly tts: TextToSpeechService;
  private readonly audioStorage: AudioStorage;

  constructor(deps: PrecomputeTtsServiceDeps) {
    this.repository = deps.repository;
    this.tts = deps.tts;
    this.audioStorage = deps.audioStorage;
  }

  /**
   * Pre-computes TTS audio for a single assistant message.
   *
   * @param messageId - UUID of the assistant message.
   * @param voice - Optional voice override (defaults to `env.tts.voice`).
   * @returns Result describing whether audio was computed, already cached, skipped, or errored.
   */
  async precomputeForMessage(messageId: string, voice?: string): Promise<PrecomputeTtsResult> {
    const row = await this.repository.getMessageById(messageId);
    if (!row) {
      return { messageId, status: 'error', reason: 'message_not_found' };
    }
    const message = row.message;
    if (message.role !== 'assistant') {
      return { messageId, status: 'skipped', reason: 'not_assistant' };
    }
    if (!message.text?.trim()) {
      return { messageId, status: 'skipped', reason: 'empty_text' };
    }

    const targetVoice = voice ?? env.tts.voice;

    if (
      message.audioUrl &&
      message.audioVoice === targetVoice &&
      this.isAudioFresh(message.audioGeneratedAt)
    ) {
      return { messageId, status: 'cached', audioUrl: message.audioUrl };
    }

    try {
      const result = await this.tts.synthesize({ text: message.text, voice: targetVoice });
      const ref = await this.audioStorage.save({
        buffer: result.audio,
        contentType: result.contentType,
      });
      await this.repository.updateMessageAudio(messageId, {
        audioUrl: ref,
        audioGeneratedAt: new Date(),
        audioVoice: targetVoice,
      });
      logger.info('tts.precompute.success', { messageId, voice: targetVoice, ref });
      return { messageId, status: 'computed', audioUrl: ref };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn('tts.precompute.error', { messageId, reason });
      return { messageId, status: 'error', reason };
    }
  }

  /**
   * Pre-computes TTS audio for a batch of messages — used by walk audio guides
   * pre-generation. Sequential by default to respect TTS rate limits.
   *
   * @param messageIds - UUIDs of assistant messages.
   * @param voice - Optional voice override applied to all messages.
   * @returns Per-message outcomes.
   */
  async precomputeBatch(messageIds: string[], voice?: string): Promise<PrecomputeTtsResult[]> {
    const outcomes: PrecomputeTtsResult[] = [];
    for (const messageId of messageIds) {
      // Sequential — TTS providers throttle aggressively; parallelism is not a win at our scale.
       
      const outcome = await this.precomputeForMessage(messageId, voice);
      outcomes.push(outcome);
    }
    return outcomes;
  }

  private isAudioFresh(generatedAt?: Date | null): boolean {
    if (!generatedAt) return false;
    const ageMs = Date.now() - generatedAt.getTime();
    const ttlMs = env.tts.cacheTtlSeconds * 1000;
    return ageMs < ttlMs;
  }
}
