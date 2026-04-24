/** Input for persisting a base64-encoded image to storage. */
export interface SaveImageInput {
  /** Raw base64 image data (no data-URI prefix). */
  base64: string;
  /** MIME type (e.g. `image/jpeg`). */
  mimeType: string;
  /** Optional explicit object key; a user-scoped UUID key is generated when omitted. */
  objectKey?: string;
  /**
   * Owning user ID. Used to build the user-scoped key path
   * (`chat-images/user-<userId>/YYYY/MM/<uuid>.<ext>`) when `objectKey` is omitted.
   * Required for GDPR Art. 17 compliance (cleanup via key-prefix).
   */
  userId?: number;
}

/**
 * Optional hook: fetches legacy image references (pre-user-scoped key format)
 * for a given user. Passed to `deleteByPrefix` to clean up historical records
 * that don't sit under `chat-images/user-<userId>/`.
 */
export type LegacyImageKeyFetcher = (userId: number) => Promise<string[]>;

/** Port for storing chat-related images (S3 or local filesystem). */
export interface ImageStorage {
  /**
   * Persists an image and returns a storage reference string (e.g. `local://...` or `s3://...`).
   *
   * @param input - Base64 data, MIME type, optional explicit key, optional userId for path scoping.
   * @returns A storage reference URI.
   */
  save(input: SaveImageInput): Promise<string>;

  /**
   * Deletes every image attached to the given user (GDPR right-to-erasure).
   *
   * Implementations MUST:
   * - List & delete all objects under the `chat-images/user-<userId>/` prefix.
   * - Optionally call `legacyFetcher` to retrieve keys for historical records
   *   that predate the user-scoped key format, and delete those directly.
   *
   * @param userId - Numeric user ID (as number or string form).
   * @param legacyFetcher - Optional callback yielding legacy keys for this user.
   */
  deleteByPrefix(userId: number | string, legacyFetcher?: LegacyImageKeyFetcher): Promise<void>;
}
