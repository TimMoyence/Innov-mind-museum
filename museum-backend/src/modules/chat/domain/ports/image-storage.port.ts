/** Input for persisting a base64-encoded image to storage. */
export interface SaveImageInput {
  /** Raw base64 image data (no data-URI prefix). */
  base64: string;
  /** MIME type (e.g. `image/jpeg`). */
  mimeType: string;
  /** Optional explicit object key; a UUID-based key is generated when omitted. */
  objectKey?: string;
}

/** Port for storing chat-related images (S3 or local filesystem). */
export interface ImageStorage {
  /**
   * Persists an image and returns a storage reference string (e.g. `local://...` or `s3://...`).
   * @param input - Base64 data, MIME type, and optional key.
   * @returns A storage reference URI.
   */
  save(input: SaveImageInput): Promise<string>;

  /**
   * Deletes all images matching the given key prefix (GDPR right-to-erasure).
   * @param prefix - Object key prefix to match for deletion.
   */
  deleteByPrefix(prefix: string): Promise<void>;
}
