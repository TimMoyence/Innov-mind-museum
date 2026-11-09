import sharp from 'sharp';

import { AppError } from '@shared/errors/app.error';

import type {
  ImageProcessorPort,
  StrippedImage,
} from '@modules/chat/domain/ports/image-processor.port';

export type { ImageProcessorPort, StrippedImage };

const SHARP_DECODE_OPTIONS = {
  limitInputPixels: 24_000_000,
  failOn: 'error' as const,
};

export class ImageDecodeError extends AppError {
  constructor(message = 'Uploaded image could not be decoded') {
    super({ message, statusCode: 400, code: 'IMAGE_DECODE_FAILED', inputRejected: true });
    this.name = 'ImageDecodeError';
  }
}

const ANIMATED_MIMES = new Set(['image/gif', 'image/webp']);

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

export class SharpImageProcessor implements ImageProcessorPort {
  async stripExif(buffer: Buffer, mime: string): Promise<StrippedImage> {
    return await stripExifFromImage(buffer, mime);
  }
}
