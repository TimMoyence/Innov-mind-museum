import sharp from 'sharp';

import { AppError } from '@shared/errors/app.error';

import type {
  ImageProcessorPort,
  StrippedImage,
} from '@modules/chat/domain/ports/image-processor.port';

// Identity-preserving re-export (spec R5) — `ImageProcessorPort` / `StrippedImage`
// moved to `domain/ports/image-processor.port.ts` (B2 close, run
// 2026-06-04-hexagonal-boundaries-enforcement). The port is a DOMAIN concept;
// this adapter `implements` it. Re-exported so existing importers of this module
// (and the application use-cases that injected the port) compile unchanged.
export type { ImageProcessorPort, StrippedImage };

/**
 * `limitInputPixels` caps at 24 Mpx — exceeds legitimate mobile upload yet well below
 * the 268 Mpx zip-bomb danger zone (default cap) reachable by crafted 3 MB PNG.
 * `failOn: 'error'` escalates sharp warnings into decode errors wrapped as ImageDecodeError.
 * Ref: docs/audit-2026-05-12-raw/05-gaps/F4-critical-bugs-verified.md §Claim 4.
 */
const SHARP_DECODE_OPTIONS = {
  limitInputPixels: 24_000_000,
  failOn: 'error' as const,
};

/** Always 400 (user input). Do not surface sharp's raw error message — can leak internal paths. */
export class ImageDecodeError extends AppError {
  constructor(message = 'Uploaded image could not be decoded') {
    super({ message, statusCode: 400, code: 'IMAGE_DECODE_FAILED' });
    this.name = 'ImageDecodeError';
  }
}

const ANIMATED_MIMES = new Set(['image/gif', 'image/webp']);

/**
 * JPEG/PNG re-encode static (drop metadata except orientation via `.rotate()` to preserve
 * visible pixels). GIF/WebP re-encode with `{ animated: true }` to preserve frames.
 *
 * @throws {ImageDecodeError} When sharp cannot decode the input.
 */
export async function stripExifFromImage(buffer: Buffer, mime: string): Promise<StrippedImage> {
  const animated = ANIMATED_MIMES.has(mime);

  try {
    if (mime === 'image/gif') {
      const { data, info } = await sharp(buffer, { ...SHARP_DECODE_OPTIONS, animated: true })
        .gif()
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, mime: 'image/gif', width: info.width, height: info.height };
    }

    if (mime === 'image/webp') {
      const pipeline = animated
        ? sharp(buffer, { ...SHARP_DECODE_OPTIONS, animated: true }).webp({ effort: 4 })
        : sharp(buffer, SHARP_DECODE_OPTIONS).rotate().webp({ effort: 4 });
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      return { buffer: data, mime: 'image/webp', width: info.width, height: info.height };
    }

    if (mime === 'image/png') {
      const { data, info } = await sharp(buffer, SHARP_DECODE_OPTIONS)
        .rotate()
        .png()
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, mime: 'image/png', width: info.width, height: info.height };
    }

    // Default JPEG static pipeline — re-encode through JPEG strips EXIF wholesale.
    const { data, info } = await sharp(buffer, SHARP_DECODE_OPTIONS)
      .rotate()
      .jpeg()
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: 'image/jpeg', width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new ImageDecodeError();
  }
}

/** Stateless — safe to share a single instance across requests. */
export class SharpImageProcessor implements ImageProcessorPort {
  async stripExif(buffer: Buffer, mime: string): Promise<StrippedImage> {
    return await stripExifFromImage(buffer, mime);
  }
}
