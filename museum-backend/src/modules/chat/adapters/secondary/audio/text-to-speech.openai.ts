import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { emitChatPhaseSpan } from '@shared/observability/chat-phase-span';
import {
  ChatPhaseTimer,
  type ChatPhaseErrorType,
  type ChatPhaseOutcome,
} from '@shared/observability/chat-phase-timer';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';
import { env } from '@src/config/env';

import { estimateTtsCostCents } from './voice-cost-pricing';

import type { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';
import type { TtsResult, TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { LlmPathTier } from '@shared/observability/derive-tier';
import type { LangfuseGenerationClient } from 'langfuse';

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

/**
 * TD-20 (R2/R5/R8/D2) — opens the TTS Langfuse `generation` (cost path, billed
 * per CHARACTERS). PATTERNS.md §2.3 `trace().generation()` chain + §9.3 P3;
 * fail-open via `safeTrace` + `getLangfuse()` (PATTERNS.md:310,313 DO#12,#15).
 * PII discipline (NFR Privacy / PATTERNS.md §8.1): only the text LENGTH +
 * `voice` enum, never the input text. Scope spread-omit so an absent
 * `museumId`/`tier` (contextless `describe` path) produces an ABSENT key, never
 * `null` (UFR-013). Returns `undefined` when Langfuse is disabled.
 */
const openTtsGeneration = (
  text: string,
  voice: string,
  requestId: string,
  scope: { museumId?: number; tier?: LlmPathTier },
): LangfuseGenerationClient | undefined =>
  safeTrace('langfuse.tts.generation.create', () => {
    const lf = getLangfuse();
    return lf
      ?.trace({
        name: 'tts.synthesize',
        metadata: { requestId, ...scope },
      })
      .generation({
        name: 'tts.synthesize.generation',
        model: env.tts.model,
        // v3.38.20 — `unit` lives INSIDE `usage` (PATTERNS.md §2.5 + SDK
        // `Usage.unit`), NOT at the generation body top level. `usageDetails`
        // also emitted so the cost server reads the per-metric record.
        usage: { input: text.length, unit: 'CHARACTERS' },
        usageDetails: { input: text.length },
        metadata: { textLength: text.length, voice, ...scope },
      });
  });

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

    const timer = ChatPhaseTimer.start('tts', 'openai', requestId, {
      model: env.tts.model,
      metadata: { textLength: text.length, voice },
    });
    // A5 R5 — Langfuse span `chat.phase.synthesizing-voice` (sibling of Prom dim, distinct concerns).
    const synthesisStartedAtMs = Date.now();

    // TD-20 — cost-attribution generation (spread-omit scope, never fabricated).
    const scope = {
      ...(input.museumId !== undefined ? { museumId: input.museumId } : {}),
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
    };
    const generation = openTtsGeneration(text, voice, requestId, scope);

    let outcome: ChatPhaseOutcome = 'success';
    let errorType: ChatPhaseErrorType = 'unknown';
    try {
      const apiKey = requireApiKey();
      const response = await fetchSpeech(apiKey, text, voice);
      const audio = await parseSpeechResponse(response);
      // M1 W5-C3 — feed the global cost breaker only on billable success, derived
      // from the (truncated) char count actually sent (design §D1/D3/AC2).
      this.recordVoiceCost(estimateTtsCostCents(text.length));
      safeTrace('langfuse.tts.generation.end', () => generation?.end({}));
      return { audio, contentType: 'audio/ogg' };
    } catch (err) {
      outcome = 'error';
      errorType = classifyTtsError(err);
      safeTrace('langfuse.tts.generation.end.error', () =>
        generation?.end({
          level: 'ERROR',
          statusMessage: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    } finally {
      timer.end(outcome, errorType);
      emitChatPhaseSpan('synthesizing-voice', synthesisStartedAtMs, {
        requestId,
        voice,
        textLength: text.length,
        outcome,
      });
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
