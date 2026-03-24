/** Result of a text-to-speech synthesis request. */
export interface TtsResult {
  /** Raw audio buffer (MP3). */
  audio: Buffer;
  /** MIME content type of the audio (e.g. `audio/mpeg`). */
  contentType: string;
}

/** Port for text-to-speech synthesis of assistant messages. */
export interface TextToSpeechService {
  /**
   * Synthesizes speech from text.
   * @param input - Text to synthesize and optional voice override.
   * @returns Audio buffer with content type metadata.
   */
  synthesize(input: { text: string; voice?: string }): Promise<TtsResult>;
}
