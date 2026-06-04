/**
 * Domain port for image pre-processing (EXIF stripping / re-encode). Relocated
 * from `adapters/secondary/image/image-processing.service.ts` so application
 * use-cases depend on a DOMAIN port rather than an infrastructure adapter
 * (B2 close, run 2026-06-04-hexagonal-boundaries-enforcement). The adapter
 * (`SharpImageProcessor`) implements this port; identity is preserved via a
 * re-export from the adapter module (spec R5).
 *
 * GDPR Art. 5(1)(c) data minimisation + STRIDE I4 — implementations MUST strip
 * privacy-sensitive metadata (EXIF GPS, device, timestamp, tEXt, ICC except
 * orientation) and MUST preserve animation for `image/gif` / `image/webp`.
 */
export interface StrippedImage {
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
}

/**
 * @throws {AppError} 400 / `IMAGE_DECODE_FAILED` when input is corrupt.
 */
export interface ImageProcessorPort {
  stripExif(buffer: Buffer, mime: string): Promise<StrippedImage>;
}
