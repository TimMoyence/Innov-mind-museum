export interface SaveImageInput {
  /** No data-URI prefix. */
  base64: string;
  mimeType: string;
  /** User-scoped UUID key generated when omitted. */
  objectKey?: string;
  /**
   * Used to build user-scoped key path
   * (`chat-images/user-<userId>/YYYY/MM/<uuid>.<ext>`) when `objectKey` omitted.
   * Required for GDPR Art. 17 (cleanup via key-prefix).
   */
  userId?: number;
}

/**
 * Fetches legacy refs (pre-user-scoped key format) so `deleteByPrefix` can
 * clean records not under `chat-images/user-<userId>/`.
 */
export type LegacyImageKeyFetcher = (userId: number) => Promise<string[]>;

export interface ImageStorage {
  /** @returns reference URI (e.g. `local://...` or `s3://...`). */
  save(input: SaveImageInput): Promise<string>;

  /**
   * GDPR right-to-erasure. Implementations MUST:
   * - delete all objects under `chat-images/user-<userId>/` prefix,
   * - optionally call `legacyFetcher` for pre-format records and delete those.
   */
  deleteByPrefix(userId: number | string, legacyFetcher?: LegacyImageKeyFetcher): Promise<void>;
}
