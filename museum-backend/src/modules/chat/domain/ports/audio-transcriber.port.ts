import { AppError } from '@shared/errors/app.error';

import type { LlmPathTier } from '@shared/observability/derive-tier';

export interface AudioTranscriberInput {
  base64: string;
  mimeType: string;
  locale?: string;
  requestId?: string;
  /**
   * W7.4 (2026-05-17) — OpenAI STT `prompt` param (≤224 tokens, ~896 chars).
   * Biases recognition toward expected vocabulary (artist names, artwork
   * titles, museum names). MUST be free of visitor PII — callers strip
   * email/name patterns before passing.
   */
  prompt?: string;
  /**
   * TD-20 (R11b) — OPTIONAL per-tenant scope threaded from the tenant-scoped
   * call site (`chat-message.service` STT) so the Langfuse STT `generation`
   * carries real attribution. Omitted (never fabricated) when absent.
   */
  museumId?: number;
  tier?: LlmPathTier;
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
  /** @throws {Error} AppError code `FEATURE_UNAVAILABLE`. */
  // eslint-disable-next-line @typescript-eslint/require-await -- null-object pattern: interface requires async signature
  async transcribe(): Promise<AudioTranscriptionResult> {
    throw new AppError({
      message: 'Audio transcription is disabled in the current environment.',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
}
