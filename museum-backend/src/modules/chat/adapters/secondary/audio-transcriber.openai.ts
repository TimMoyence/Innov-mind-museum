import { env } from '@src/config/env';
import { AppError, badRequest } from '@shared/errors/app.error';
import { startSpan } from '@shared/observability/sentry';

/** Input for an audio transcription request. */
export interface AudioTranscriberInput {
  /** Base64-encoded audio data. */
  base64: string;
  /** Audio MIME type (e.g. `audio/mpeg`). */
  mimeType: string;
  /** Optional locale hint to improve transcription accuracy. */
  locale?: string;
  /** Optional request ID for tracing. */
  requestId?: string;
}

/** Result of a successful audio transcription. */
export interface AudioTranscriptionResult {
  /** Transcribed text. */
  text: string;
  /** Model used for transcription (e.g. `whisper-1`). */
  model: string;
  /** Upstream provider identifier. */
  provider: 'openai';
}

/** Port for speech-to-text transcription of audio messages. */
export interface AudioTranscriber {
  /**
   * Transcribes base64-encoded audio into text.
   * @param input - Audio data, MIME type, and optional locale/requestId.
   * @returns Transcribed text with model and provider metadata.
   */
  transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult>;
}

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
   * @param input - Base64 audio, MIME type, and optional locale hint.
   * @returns Transcription result.
   * @throws AppError with code `FEATURE_UNAVAILABLE` if provider is not OpenAI.
   * @throws AppError with code `UPSTREAM_AUDIO_TRANSCRIPTION_ERROR` on API failure.
   */
  async transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult> {
    return startSpan({
      name: 'audio.transcribe',
      op: 'ai.transcribe',
      attributes: {
        'audio.mime_type': input.mimeType,
        'audio.model': env.llm.audioTranscriptionModel,
      },
    }, async () => {
    if (env.llm.provider !== 'openai' || !env.llm.openAiApiKey) {
      throw new AppError({
        message:
          'Audio transcription is currently available only when LLM provider is OpenAI.',
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    }

    const normalizedBase64 = input.base64?.trim();
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

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.llm.openAiApiKey}`,
      },
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as
      | OpenAiTranscriptionPayload
      | null;

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
    }); // end startSpan('audio.transcribe')
  }
}

/** Stub implementation of {@link AudioTranscriber} that always throws — used when transcription is disabled. */
export class DisabledAudioTranscriber implements AudioTranscriber {
  /** @throws AppError with code `FEATURE_UNAVAILABLE` — always. */
  async transcribe(): Promise<AudioTranscriptionResult> {
    throw new AppError({
      message: 'Audio transcription is disabled in the current environment.',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
