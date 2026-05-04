import { AppError } from '@shared/errors/app.error';
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
   * @param input - Text to synthesize and optional voice override.
   * @param input.text - Text content to synthesize.
   * @param input.voice - Optional voice identifier override.
   * @returns MP3 audio buffer.
   * @throws {AppError} With code `FEATURE_UNAVAILABLE` if OpenAI API key is missing.
   * @throws {AppError} With code `UPSTREAM_TTS_ERROR` on API failure.
   */
  async synthesize(input: { text: string; voice?: string }): Promise<TtsResult> {
    const apiKey = requireApiKey();
    const text = input.text.slice(0, env.tts.maxTextLength);
    const voice = input.voice ?? env.tts.voice;

    const response = await fetchSpeech(apiKey, text, voice);
    const audio = await parseSpeechResponse(response);

    return { audio, contentType: 'audio/mpeg' };
  }
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
