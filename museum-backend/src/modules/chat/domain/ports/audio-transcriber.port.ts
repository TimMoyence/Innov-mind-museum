import { AppError } from '@shared/errors/app.error';

import type { LlmPathTier } from '@shared/observability/derive-tier';

export interface AudioTranscriberInput {
  base64: string;
  mimeType: string;
  locale?: string;
  requestId?: string;
  prompt?: string;
  museumId?: number;
  tier?: LlmPathTier;
}

export interface AudioTranscriptionResult {
  text: string;
  model: string;
  provider: 'openai';
}

export interface AudioTranscriber {
  transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult>;
}

export class DisabledAudioTranscriber implements AudioTranscriber {
  transcribe(): Promise<AudioTranscriptionResult> {
    return Promise.reject(
      new AppError({
        message: 'Audio transcription is disabled in the current environment.',
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      }),
    );
  }
}
