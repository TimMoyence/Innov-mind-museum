import { env } from '@src/config/env';
import { AppError, badRequest } from '@shared/errors/app.error';

export interface AudioTranscriberInput {
  base64: string;
  mimeType: string;
  locale?: string;
  requestId?: string;
}

export interface AudioTranscriptionResult {
  text: string;
  model: string;
  provider: 'openai';
}

export interface AudioTranscriber {
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

export class OpenAiAudioTranscriber implements AudioTranscriber {
  async transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult> {
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
  }
}

export class DisabledAudioTranscriber implements AudioTranscriber {
  async transcribe(): Promise<AudioTranscriptionResult> {
    throw new AppError({
      message: 'Audio transcription is disabled in the current environment.',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
