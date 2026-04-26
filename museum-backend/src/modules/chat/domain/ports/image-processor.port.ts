/**
 * Result of stripping EXIF / metadata from an uploaded image.
 *
 * `buffer` is the cleaned binary, `mime` reflects the format we re-encoded to
 * (always equal to or a normalised form of the input MIME), and `width` /
 * `height` come from the decoded raster dimensions (useful for downstream
 * audit logs and analytics, no PII).
 */
export interface StrippedImage {
  /** Cleaned raw image buffer with EXIF / metadata removed. */
  buffer: Buffer;
  /** Re-encoded MIME type (jpeg/png/webp/gif). */
  mime: string;
  /** Decoded width in pixels. */
  width: number;
  /** Decoded height in pixels. */
  height: number;
}

/**
 * Port that strips privacy-sensitive metadata (EXIF GPS, device, timestamp,
 * tEXt chunks, ICC except orientation) from an uploaded image.
 *
 * Required for GDPR Art. 5(1)(c) — data minimisation — and STRIDE I4
 * (information disclosure) on the chat-image upload pipeline.
 *
 * Implementations MUST preserve animation for `image/gif` and `image/webp`.
 */
export interface ImageProcessorPort {
  /**
   * Strips EXIF / metadata from the given image buffer.
   *
   * @param buffer - Raw image bytes (post-magic-byte validation).
   * @param mime - Declared / sniffed MIME type.
   * @returns Cleaned buffer, MIME, and decoded raster dimensions.
   * @throws {AppError} 400 / `IMAGE_DECODE_FAILED` when the input is corrupt.
   */
  stripExif(buffer: Buffer, mime: string): Promise<StrippedImage>;
}
