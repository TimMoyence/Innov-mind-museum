import { AppError } from '@shared/errors/app.error';

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
   *
   * @param input - Audio data, MIME type, and optional locale/requestId.
   * @returns Transcribed text with model and provider metadata.
   */
  transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult>;
}

/** Stub implementation of {@link AudioTranscriber} that always throws -- used when transcription is disabled. */
export class DisabledAudioTranscriber implements AudioTranscriber {
  /** Always throws because audio transcription is disabled. \@throws {AppError} With code `FEATURE_UNAVAILABLE`. */
  // eslint-disable-next-line @typescript-eslint/require-await -- null-object pattern: interface requires async signature
  async transcribe(): Promise<AudioTranscriptionResult> {
    throw new AppError({
      message: 'Audio transcription is disabled in the current environment.',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
