import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { TtsResult, TextToSpeechService } from '../../domain/ports/tts.port';

// Re-export domain port types so existing consumers that imported from here keep working
export type { TtsResult, TextToSpeechService } from '../../domain/ports/tts.port';

/** OpenAI TTS implementation using POST https://api.openai.com/v1/audio/speech */
export class OpenAiTextToSpeechService implements TextToSpeechService {
  /**
   * Sends text to the OpenAI TTS API and returns the synthesized audio.
   *
   * @param input - Text to synthesize and optional voice override.
   * @param input.text - Text content to synthesize.
   * @param input.voice - Optional voice identifier override.
   * @returns MP3 audio buffer.
   * @throws AppError with code `FEATURE_UNAVAILABLE` if OpenAI API key is missing.
   * @throws AppError with code `UPSTREAM_TTS_ERROR` on API failure.
   */
  // eslint-disable-next-line complexity -- TTS synthesis has multiple validation and error-handling paths
  async synthesize(input: { text: string; voice?: string }): Promise<TtsResult> {
    const apiKey = env.llm.openAiApiKey;
    if (!apiKey) {
      throw new AppError({
        message: 'TTS requires OpenAI API key',
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    }

    const text = input.text.slice(0, env.tts?.maxTextLength ?? 4096);

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.tts?.model ?? 'tts-1',
          input: text,
          voice: input.voice ?? env.tts?.voice ?? 'alloy',
          speed: env.tts?.speed ?? 1,
          response_format: 'mp3',
        }),
        signal: AbortSignal.timeout(env.llm.timeoutMs),
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AppError({
          message: 'Text-to-speech request timed out',
          statusCode: 504,
          code: 'UPSTREAM_TIMEOUT',
        });
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new AppError({
        message: `OpenAI TTS failed (${response.status}): ${errorText}`,
        statusCode: 502,
        code: 'UPSTREAM_TTS_ERROR',
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      contentType: 'audio/mpeg',
    };
  }
}

/** Stub TTS service that always throws — used when text-to-speech is disabled. */
export class DisabledTextToSpeechService implements TextToSpeechService {
  /** Always throws because text-to-speech is disabled. @throws AppError with code `FEATURE_UNAVAILABLE`. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async synthesize(): Promise<TtsResult> {
    throw new AppError({
      message: 'Text-to-speech is not available',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
