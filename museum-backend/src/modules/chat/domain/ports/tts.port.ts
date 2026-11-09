import type { LlmPathTier } from '@shared/observability/derive-tier';

export interface TtsResult {
  audio: Buffer;
  contentType: string;
}

export interface TextToSpeechService {
  synthesize(input: {
    text: string;
    voice?: string;
    requestId?: string;
    museumId?: number;
    tier?: LlmPathTier;
  }): Promise<TtsResult>;
}
