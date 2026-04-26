import sharp from 'sharp';

import { AppError } from '@shared/errors/app.error';

import type { ImageProcessorPort, StrippedImage } from '../../domain/ports/image-processor.port';

/**
 * Thrown when sharp cannot decode an image buffer (corrupt, truncated, or
 * not a real raster despite a matching magic byte signature). Always 400 —
 * never a 500 — because the input came from the user.
 */
export class ImageDecodeError extends AppError {
  /**
   * Builds the error with a generic, client-safe message.
   *
   * @param message - Reason surfaced to the client (do not include sharp's raw
   *   error message — it can leak internal paths). Defaults to a generic copy.
   */
  constructor(message = 'Uploaded image could not be decoded') {
    super({ message, statusCode: 400, code: 'IMAGE_DECODE_FAILED' });
    this.name = 'ImageDecodeError';
  }
}

const ANIMATED_MIMES = new Set(['image/gif', 'image/webp']);

/**
 * Strips EXIF / metadata from an image buffer using `sharp`.
 *
 * Behaviour:
 * - JPEG / PNG: re-encode static pipeline, drop all metadata except
 *   orientation (applied via `.rotate()` so the visible pixels match what
 *   the user saw).
 * - Animated GIF: re-encode with `{ animated: true }` so frame count and
 *   delays survive.
 * - Animated WebP: re-encode with `{ animated: true }` and a balanced
 *   effort level (4) — same animation preservation guarantee.
 *
 * @param buffer - Raw image bytes.
 * @param mime - MIME type (already validated upstream).
 * @returns Cleaned buffer, MIME, and decoded width / height.
 * @throws {ImageDecodeError} When sharp cannot decode the input.
 */
export async function stripExifFromImage(buffer: Buffer, mime: string): Promise<StrippedImage> {
  const animated = ANIMATED_MIMES.has(mime);

  try {
    if (mime === 'image/gif') {
      const { data, info } = await sharp(buffer, { animated: true })
        .gif()
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, mime: 'image/gif', width: info.width, height: info.height };
    }

    if (mime === 'image/webp') {
      const pipeline = animated
        ? sharp(buffer, { animated: true }).webp({ effort: 4 })
        : sharp(buffer).rotate().webp({ effort: 4 });
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      return { buffer: data, mime: 'image/webp', width: info.width, height: info.height };
    }

    if (mime === 'image/png') {
      const { data, info } = await sharp(buffer)
        .rotate()
        .png()
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, mime: 'image/png', width: info.width, height: info.height };
    }

    // Default: JPEG static pipeline (covers `image/jpeg` and any future
    // allowed static MIME — re-encode through JPEG strips EXIF wholesale).
    const { data, info } = await sharp(buffer)
      .rotate()
      .jpeg()
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: 'image/jpeg', width: info.width, height: info.height };
  } catch (error) {
    // Re-throw AppError as-is; wrap any sharp / decode error into our typed 400.
    if (error instanceof AppError) throw error;
    throw new ImageDecodeError();
  }
}

/**
 * Default `ImageProcessorPort` adapter backed by `sharp`. Stateless — safe
 * to share a single instance across requests.
 */
export class SharpImageProcessor implements ImageProcessorPort {
  /**
   * @inheritdoc
   * @param buffer - Raw image bytes.
   * @param mime - MIME type (already validated upstream).
   * @returns Cleaned image with width/height.
   */
  async stripExif(buffer: Buffer, mime: string): Promise<StrippedImage> {
    return await stripExifFromImage(buffer, mime);
  }
}
