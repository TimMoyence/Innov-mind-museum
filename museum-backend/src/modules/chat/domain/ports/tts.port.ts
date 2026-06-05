import type { LlmPathTier } from '@shared/observability/derive-tier';

export interface TtsResult {
  /** Encoded audio bytes; the wire format is carried by `contentType` (currently Opus, `audio/ogg`). */
  audio: Buffer;
  contentType: string;
}

export interface TextToSpeechService {
  /**
   * `requestId` correlates the `chat.tts` phase span with the parent chat
   * request — instrumentation falls back to `'unknown'` when absent.
   *
   * TD-20 (R11a) — `museumId`/`tier` are OPTIONAL per-tenant scope threaded from
   * tenant-scoped call sites (chat-media) so the Langfuse TTS `generation`
   * carries real attribution. Genuinely contextless callers (one-shot
   * `describe`) omit them — they are never fabricated (UFR-013).
   */
  synthesize(input: {
    text: string;
    voice?: string;
    requestId?: string;
    museumId?: number;
    tier?: LlmPathTier;
  }): Promise<TtsResult>;
}
