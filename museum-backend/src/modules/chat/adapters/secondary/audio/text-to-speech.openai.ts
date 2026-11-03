import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import {
  ChatPhaseTimer,
  type ChatPhaseErrorType,
  type ChatPhaseOutcome,
} from '@shared/observability/chat-phase-timer';
import { env } from '@src/config/env';

import { estimateTtsCostCents } from './voice-cost-pricing';

import type { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';
import type { TtsResult, TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { LlmPathTier } from '@shared/observability/derive-tier';

export type { TtsResult, TextToSpeechService } from '@modules/chat/domain/ports/tts.port';

const requireApiKey = (): string => {
  const apiKey = env.llm.openAiApiKey;
  if (!apiKey) {
    throw new AppError({
      message: 'TTS requires OpenAI API key',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
  return apiKey;
};

/** Wraps timeout/abort → AppError(504). */
const fetchSpeech = async (apiKey: string, text: string, voice: string): Promise<Response> => {
  try {
    return await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.tts.model,
        input: text,
        voice,
        speed: env.tts.speed,
        // Opus/OGG container: -40% bandwidth + -50-100ms first-byte vs MP3 (C9.12a
        // 2026-05-17). Universal mobile support (iOS 14+, Android 5+).
        response_format: 'opus',
      }),
      signal: AbortSignal.timeout(env.llm.timeoutMs),
    });
  } catch (error: unknown) {
    if (
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new AppError({
        message: 'Text-to-speech request timed out',
        statusCode: 504,
        code: 'UPSTREAM_TIMEOUT',
      });
    }
    throw error;
  }
};

const parseSpeechResponse = async (response: Response): Promise<Buffer> => {
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new AppError({
      message: `OpenAI TTS failed (${response.status}): ${errorText}`,
      statusCode: 502,
      code: 'UPSTREAM_TTS_ERROR',
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};


/** POST https://api.openai.com/v1/audio/speech */
export class OpenAiTextToSpeechService implements TextToSpeechService {
  /**
   * M1 W5-C3 — optional global cost breaker. Nullable so existing tests / dev
   * paths constructing the adapter without it stay no-op (same contract as the
   * orchestrator's `deps.costBreaker ?? null`). Observe-only: voice is NEVER
   * gated on `canAttempt()` (design §D4).
   */
  private readonly costBreaker: LlmCostCircuitBreaker | null;

  constructor(costBreaker?: LlmCostCircuitBreaker | null) {
    this.costBreaker = costBreaker ?? null;
  }

  /**
   * Fail-open cost charge (mirrors `langchain.orchestrator.ts` `recordSectionCost`).
   * Sync in-process arithmetic + map write (no I/O); any failure is logged but
   * NEVER propagates into the synthesis hot path (design §D5/AC5).
   */
  private recordVoiceCost(cents: number): void {
    if (!this.costBreaker) return;
    try {
      this.costBreaker.recordCharge(cents);
    } catch (err) {
      logger.warn('voice_cost_record_failed', {
        modality: 'tts',
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** @throws {Error} AppError FEATURE_UNAVAILABLE | UPSTREAM_TTS_ERROR */
  async synthesize(input: {
    text: string;
    voice?: string;
    requestId?: string;
    museumId?: number;
    tier?: LlmPathTier;
  }): Promise<TtsResult> {
    const text = input.text.slice(0, env.tts.maxTextLength);
    const voice = input.voice ?? env.tts.voice;
    const requestId = input.requestId ?? 'unknown';

    const timer = ChatPhaseTimer.start('tts', 'openai', requestId);
    let outcome: ChatPhaseOutcome = 'success';
    let errorType: ChatPhaseErrorType = 'unknown';
    try {
      const apiKey = requireApiKey();
      const response = await fetchSpeech(apiKey, text, voice);
      const audio = await parseSpeechResponse(response);
      // M1 W5-C3 — feed the global cost breaker only on billable success, derived
      // from the (truncated) char count actually sent (design §D1/D3/AC2).
      this.recordVoiceCost(estimateTtsCostCents(text.length));
      return { audio, contentType: 'audio/ogg' };
    } catch (err) {
      outcome = 'error';
      errorType = classifyTtsError(err);
      throw err;
    } finally {
      timer.end(outcome, errorType);
    }
  }
}

function classifyTtsError(err: unknown): ChatPhaseErrorType {
  if (err instanceof AppError) {
    if (err.code === 'UPSTREAM_TIMEOUT') return 'timeout';
    if (err.code === 'UPSTREAM_TTS_ERROR') return 'upstream_5xx';
  }
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return err.name === 'TimeoutError' ? 'timeout' : 'abort';
  }
  return 'unknown';
}

/** Always throws — TTS disabled. */
export class DisabledTextToSpeechService implements TextToSpeechService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async synthesize(): Promise<TtsResult> {
    throw new AppError({
      message: 'Text-to-speech is not available',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
