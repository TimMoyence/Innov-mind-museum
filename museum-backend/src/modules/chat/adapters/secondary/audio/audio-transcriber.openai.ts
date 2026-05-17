import { AppError, badRequest } from '@shared/errors/app.error';
import { extensionByMime } from '@shared/media/mime-extensions';
import {
  ChatPhaseTimer,
  type ChatPhaseErrorType,
  type ChatPhaseOutcome,
} from '@shared/observability/chat-phase-timer';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import type {
  AudioTranscriberInput,
  AudioTranscriptionResult,
  AudioTranscriber,
} from '@modules/chat/domain/ports/audio-transcriber.port';

const toLanguageHint = (locale?: string): string | undefined => {
  const candidate = locale?.trim();
  if (!candidate) {
    return undefined;
  }

  const normalized = candidate.split('-')[0]?.toLowerCase();
  return normalized && normalized.length <= 8 ? normalized : undefined;
};

const toAudioFileName = (mimeType: string): string => {
  const extension = extensionByMime[mimeType] || 'm4a';
  return `voice-input.${extension}`;
};

interface OpenAiTranscriptionPayload {
  text?: unknown;
  error?: {
    message?: unknown;
  };
}

const assertOpenAiAvailable = (): void => {
  if (env.llm.provider !== 'openai' || !env.llm.openAiApiKey) {
    throw new AppError({
      message: 'Audio transcription is currently available only when LLM provider is OpenAI.',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
};

/** @throws {Error} 400 on empty/invalid input. */
const decodeAudioPayload = (base64: string): Buffer => {
  const normalizedBase64 = base64.trim();
  if (!normalizedBase64) {
    throw badRequest('Audio payload is empty');
  }

  const audioBuffer = Buffer.from(normalizedBase64, 'base64');
  if (!audioBuffer.byteLength) {
    throw badRequest('Audio payload is invalid');
  }
  return audioBuffer;
};

const buildTranscriptionFormData = (
  input: AudioTranscriberInput,
  audioBuffer: Buffer,
): FormData => {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: input.mimeType }),
    toAudioFileName(input.mimeType),
  );
  formData.append('model', env.llm.audioTranscriptionModel);

  const languageHint = toLanguageHint(input.locale);
  if (languageHint) {
    formData.append('language', languageHint);
  }
  return formData;
};

/** Wraps timeout/abort → AppError(504). */
const fetchTranscription = async (formData: FormData): Promise<Response> => {
  try {
    return await fetch('https://api.openai.com/v1/audio/transcriptions', {
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
};

const parseTranscriptionResponse = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as OpenAiTranscriptionPayload | null;

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

  return payload.text.trim();
};

/**
 * Default `gpt-4o-mini-transcribe` (env.llm.audioTranscriptionModel).
 * Reuses shared `OPENAI_API_KEY`.
 */
export class OpenAiAudioTranscriber implements AudioTranscriber {
  /** @throws {Error} AppError FEATURE_UNAVAILABLE | UPSTREAM_AUDIO_TRANSCRIPTION_ERROR */
  async transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult> {
    const requestId = input.requestId ?? 'unknown';
    const timer = ChatPhaseTimer.start('stt', 'openai', requestId, {
      model: env.llm.audioTranscriptionModel,
      metadata: { mimeType: input.mimeType, locale: input.locale },
    });
    let outcome: ChatPhaseOutcome = 'success';
    let errorType: ChatPhaseErrorType = 'unknown';
    try {
      return await startSpan(
        {
          name: 'audio.transcribe',
          op: 'ai.transcribe',
          attributes: {
            'audio.mime_type': input.mimeType,
            'audio.model': env.llm.audioTranscriptionModel,
          },
        },
        async () => {
          assertOpenAiAvailable();
          const audioBuffer = decodeAudioPayload(input.base64);
          const formData = buildTranscriptionFormData(input, audioBuffer);
          const response = await fetchTranscription(formData);
          const text = await parseTranscriptionResponse(response);

          return {
            text,
            model: env.llm.audioTranscriptionModel,
            provider: 'openai',
          };
        },
      );
    } catch (err) {
      outcome = 'error';
      errorType = classifySttError(err);
      throw err;
    } finally {
      timer.end(outcome, errorType);
    }
  }
}

function classifySttError(err: unknown): ChatPhaseErrorType {
  if (err instanceof AppError) {
    if (err.code === 'UPSTREAM_TIMEOUT') return 'timeout';
    if (
      err.code === 'UPSTREAM_AUDIO_TRANSCRIPTION_ERROR' ||
      err.code === 'UPSTREAM_AUDIO_TRANSCRIPTION_INVALID'
    ) {
      return 'upstream_5xx';
    }
  }
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return err.name === 'TimeoutError' ? 'timeout' : 'abort';
  }
  return 'unknown';
}
