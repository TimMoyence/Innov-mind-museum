/** Input for persisting an audio buffer to storage. */
export interface SaveAudioInput {
  /** Audio bytes (e.g. MP3, WAV). */
  buffer: Buffer;
  /** MIME type (e.g. `audio/mpeg`). */
  contentType: string;
  /** Optional explicit object key; a UUID-based key is generated when omitted. */
  objectKey?: string;
}

/** Result of a signed-read URL generation for an audio reference. */
export interface SignedAudioReadUrl {
  url: string;
  expiresAt: string;
}

/** Port for storing chat-related TTS audio (S3 or local filesystem). */
export interface AudioStorage {
  /**
   * Persists an audio buffer and returns a storage reference (e.g. `s3://...` or `local://...`).
   *
   * @param input - Audio buffer, content type, and optional key.
   * @returns A storage reference URI.
   */
  save(input: SaveAudioInput): Promise<string>;

  /**
   * Generates a signed read URL for an audio reference (S3) or a local-readable URL.
   *
   * @param ref - Storage reference returned by {@link save}.
   * @param ttlSeconds - Optional TTL for signed URLs (S3 only).
   * @returns Signed URL with expiry, or `null` if the reference shape is unrecognized.
   */
  getSignedReadUrl(ref: string, ttlSeconds?: number): Promise<SignedAudioReadUrl | null>;

  /**
   * Deletes the object identified by the reference.
   *
   * @param ref - Storage reference to delete.
   */
  deleteByRef(ref: string): Promise<void>;
}
