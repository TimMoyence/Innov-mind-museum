import { env } from '@src/config/env';
import { AppError } from '@shared/errors/app.error';

/** Result of a text-to-speech synthesis request. */
export interface TtsResult {
  /** Raw audio buffer (MP3). */
  audio: Buffer;
  /** MIME content type of the audio (e.g. `audio/mpeg`). */
  contentType: string;
}

/** Port for text-to-speech synthesis of assistant messages. */
export interface TextToSpeechService {
  /**
   * Synthesizes speech from text.
   * @param input - Text to synthesize and optional voice override.
   * @returns Audio buffer with content type metadata.
   */
  synthesize(input: { text: string; voice?: string }): Promise<TtsResult>;
}

/** OpenAI TTS implementation using POST https://api.openai.com/v1/audio/speech */
export class OpenAiTextToSpeechService implements TextToSpeechService {
  /**
   * Sends text to the OpenAI TTS API and returns the synthesized audio.
   * @param input - Text to synthesize and optional voice override.
   * @returns MP3 audio buffer.
   * @throws AppError with code `FEATURE_UNAVAILABLE` if OpenAI API key is missing.
   * @throws AppError with code `UPSTREAM_TTS_ERROR` on API failure.
   */
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

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.tts?.model ?? 'tts-1',
        input: text,
        voice: input.voice ?? env.tts?.voice ?? 'alloy',
        speed: env.tts?.speed ?? 1.0,
        response_format: 'mp3',
      }),
    });

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
  /** @throws AppError with code `FEATURE_UNAVAILABLE` — always. */
  async synthesize(): Promise<TtsResult> {
    throw new AppError({
      message: 'Text-to-speech is not available',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
