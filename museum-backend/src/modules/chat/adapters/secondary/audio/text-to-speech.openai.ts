import { AppError } from '@shared/errors/app.error';
import { emitChatPhaseSpan } from '@shared/observability/chat-phase-span';
import {
  ChatPhaseTimer,
  type ChatPhaseErrorType,
  type ChatPhaseOutcome,
} from '@shared/observability/chat-phase-timer';
import { env } from '@src/config/env';

import type { TtsResult, TextToSpeechService } from '@modules/chat/domain/ports/tts.port';

// Re-export domain port types so existing consumers that imported from here keep working
export type { TtsResult, TextToSpeechService } from '@modules/chat/domain/ports/tts.port';

/** Returns the OpenAI API key, throwing if unavailable. */
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

/** Sends the TTS request, wrapping timeout errors into AppError. */
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
        response_format: 'mp3',
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

/** Validates the TTS response and extracts the audio buffer. */
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

/** OpenAI TTS implementation using POST https://api.openai.com/v1/audio/speech */
export class OpenAiTextToSpeechService implements TextToSpeechService {
  /**
   * Sends text to the OpenAI TTS API and returns the synthesized audio.
   *
   * Wraps the synthesis call in a {@link ChatPhaseTimer} so the `tts` phase
   * latency lands in `chat_phase_duration_seconds{phase="tts",provider="openai"}`
   * and a `audio.tts.synthesize` Langfuse span is emitted (fail-open).
   *
   * @param input - Text to synthesize and optional voice override.
   * @param input.text - Text content to synthesize.
   * @param input.voice - Optional voice identifier override.
   * @param input.requestId - Optional request id used to correlate the span
   *   with the parent chat request. Falls back to `'unknown'` when missing.
   * @returns MP3 audio buffer.
   * @throws {AppError} With code `FEATURE_UNAVAILABLE` if OpenAI API key is missing.
   * @throws {AppError} With code `UPSTREAM_TTS_ERROR` on API failure.
   */
  async synthesize(input: {
    text: string;
    voice?: string;
    requestId?: string;
  }): Promise<TtsResult> {
    const text = input.text.slice(0, env.tts.maxTextLength);
    const voice = input.voice ?? env.tts.voice;
    const requestId = input.requestId ?? 'unknown';

    const timer = ChatPhaseTimer.start('tts', 'openai', requestId, {
      model: env.tts.model,
      metadata: { textLength: text.length, voice },
    });
    // A5 (R5) — `chat.phase.synthesizing-voice` Langfuse span. Sibling, not
    // replacement, of the existing `chat_phase_duration_seconds{phase=tts}`
    // Prom dimension owned by `ChatPhaseTimer` above (spec §1.1 Q2 — distinct
    // concerns : Prom = histogram cardinality, Langfuse = API-contract phase).
    const synthesisStartedAtMs = Date.now();

    let outcome: ChatPhaseOutcome = 'success';
    let errorType: ChatPhaseErrorType = 'unknown';
    try {
      const apiKey = requireApiKey();
      const response = await fetchSpeech(apiKey, text, voice);
      const audio = await parseSpeechResponse(response);
      return { audio, contentType: 'audio/mpeg' };
    } catch (err) {
      outcome = 'error';
      errorType = classifyTtsError(err);
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

/** Stub TTS service that always throws — used when text-to-speech is disabled. */
export class DisabledTextToSpeechService implements TextToSpeechService {
  /** Always throws because text-to-speech is disabled. \@throws {AppError} With code `FEATURE_UNAVAILABLE`. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async synthesize(): Promise<TtsResult> {
    throw new AppError({
      message: 'Text-to-speech is not available',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
