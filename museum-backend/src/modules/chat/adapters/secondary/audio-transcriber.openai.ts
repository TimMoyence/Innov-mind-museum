import { AppError, badRequest } from '@shared/errors/app.error';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import type {
  AudioTranscriberInput,
  AudioTranscriptionResult,
  AudioTranscriber,
} from '../../domain/ports/audio-transcriber.port';

// Re-export domain port types so existing consumers that imported from here keep working
export type {
  AudioTranscriberInput,
  AudioTranscriptionResult,
  AudioTranscriber,
} from '../../domain/ports/audio-transcriber.port';
export { DisabledAudioTranscriber } from '../../domain/ports/audio-transcriber.port';

const toLanguageHint = (locale?: string): string | undefined => {
  const candidate = locale?.trim();
  if (!candidate) {
    return undefined;
  }

  const normalized = candidate.split('-')[0]?.toLowerCase();
  return normalized && normalized.length <= 8 ? normalized : undefined;
};

const extensionByMimeType: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
};

const toAudioFileName = (mimeType: string): string => {
  const extension = extensionByMimeType[mimeType] || 'm4a';
  return `voice-input.${extension}`;
};

interface OpenAiTranscriptionPayload {
  text?: unknown;
  error?: {
    message?: unknown;
  };
}

/** OpenAI Whisper implementation of {@link AudioTranscriber}. */
export class OpenAiAudioTranscriber implements AudioTranscriber {
  /**
   * Sends audio to the OpenAI transcription API and returns the transcribed text.
   *
   * @param input - Base64 audio, MIME type, and optional locale hint.
   * @returns Transcription result.
   * @throws {AppError} With code `FEATURE_UNAVAILABLE` if provider is not OpenAI.
   * @throws {AppError} With code `UPSTREAM_AUDIO_TRANSCRIPTION_ERROR` on API failure.
   */
  // eslint-disable-next-line max-lines-per-function -- audio transcription has many validation and error-handling steps
  async transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult> {
    return await startSpan(
      {
        name: 'audio.transcribe',
        op: 'ai.transcribe',
        attributes: {
          'audio.mime_type': input.mimeType,
          'audio.model': env.llm.audioTranscriptionModel,
        },
      },
      // eslint-disable-next-line complexity -- inner callback handles provider check, input validation, API call, and error mapping
      async () => {
        if (env.llm.provider !== 'openai' || !env.llm.openAiApiKey) {
          throw new AppError({
            message: 'Audio transcription is currently available only when LLM provider is OpenAI.',
            statusCode: 501,
            code: 'FEATURE_UNAVAILABLE',
          });
        }

        const normalizedBase64 = input.base64.trim();
        if (!normalizedBase64) {
          throw badRequest('Audio payload is empty');
        }

        const audioBuffer = Buffer.from(normalizedBase64, 'base64');
        if (!audioBuffer.byteLength) {
          throw badRequest('Audio payload is invalid');
        }

        const formData = new FormData();
        formData.append(
          'file',
          new Blob([audioBuffer], { type: input.mimeType }),
          toAudioFileName(input.mimeType),
        );
        formData.append('model', env.llm.audioTranscriptionModel);

        const languageHint = toLanguageHint(input.locale);
        if (languageHint) {
          formData.append('language', languageHint);
        }

        let response: Response;
        try {
          response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.llm.openAiApiKey}`,
            },
            body: formData,
            signal: AbortSignal.timeout(env.llm.timeoutMs),
          });
        } catch (error: unknown) {
          if (
            error instanceof DOMException &&
            (error.name === 'TimeoutError' || error.name === 'AbortError')
          ) {
            throw new AppError({
              message: 'Audio transcription request timed out',
              statusCode: 504,
              code: 'UPSTREAM_TIMEOUT',
            });
          }
          throw error;
        }

        const payload = (await response
          .json()
          .catch(() => null)) as OpenAiTranscriptionPayload | null;

        if (!response.ok) {
          const upstreamMessage =
            typeof payload?.error?.message === 'string'
              ? payload.error.message
              : 'Audio transcription request failed';

          throw new AppError({
            message: upstreamMessage,
            statusCode: 502,
            code: 'UPSTREAM_AUDIO_TRANSCRIPTION_ERROR',
          });
        }

        if (typeof payload?.text !== 'string' || !payload.text.trim()) {
          throw new AppError({
            message: 'Audio transcription returned an empty result',
            statusCode: 502,
            code: 'UPSTREAM_AUDIO_TRANSCRIPTION_INVALID',
          });
        }

        return {
          text: payload.text.trim(),
          model: env.llm.audioTranscriptionModel,
          provider: 'openai',
        };
      },
    ); // end startSpan('audio.transcribe')
  }
}
