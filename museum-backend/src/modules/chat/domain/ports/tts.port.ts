export interface TtsResult {
  /** MP3. */
  audio: Buffer;
  contentType: string;
}

export interface TextToSpeechService {
  /**
   * `requestId` correlates the `chat.tts` phase span with the parent chat
   * request — instrumentation falls back to `'unknown'` when absent.
   */
  synthesize(input: { text: string; voice?: string; requestId?: string }): Promise<TtsResult>;
}
