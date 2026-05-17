import { AppError } from '@shared/errors/app.error';
import { emitChatPhaseSpan } from '@shared/observability/chat-phase-span';
import {
  ChatPhaseTimer,
  type ChatPhaseErrorType,
  type ChatPhaseOutcome,
} from '@shared/observability/chat-phase-timer';
import { env } from '@src/config/env';

import type { TtsResult, TextToSpeechService } from '@modules/chat/domain/ports/tts.port';

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
  /** @throws {Error} AppError FEATURE_UNAVAILABLE | UPSTREAM_TTS_ERROR */
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
    // A5 R5 — Langfuse span `chat.phase.synthesizing-voice` (sibling of Prom dim, distinct concerns).
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
