import { AppError } from '@shared/errors/app.error';

export interface AudioTranscriberInput {
  base64: string;
  mimeType: string;
  locale?: string;
  requestId?: string;
}

export interface AudioTranscriptionResult {
  text: string;
  /** e.g. `whisper-1`. */
  model: string;
  provider: 'openai';
}

export interface AudioTranscriber {
  transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult>;
}

/** Always throws — used when transcription is disabled. */
export class DisabledAudioTranscriber implements AudioTranscriber {
  /** @throws AppError code `FEATURE_UNAVAILABLE`. */
  // eslint-disable-next-line @typescript-eslint/require-await -- null-object pattern: interface requires async signature
  async transcribe(): Promise<AudioTranscriptionResult> {
    throw new AppError({
      message: 'Audio transcription is disabled in the current environment.',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
