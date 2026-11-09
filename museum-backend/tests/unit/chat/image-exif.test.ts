import exifr from 'exifr';
import sharp from 'sharp';

import {
  ImageDecodeError,
  SharpImageProcessor,
  stripExifFromImage,
} from '@modules/chat/adapters/secondary/image/image-processing.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';

import {
  createAnimatedGif,
  createAnimatedWebp,
  createCorruptJpeg,
  createJpegWithExif,
  createPngWithMetadata,
  createWebpWithExif,
  verifyExifStripped,
} from 'tests/helpers/chat/image-fixtures';

import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';

describe('image EXIF strip pipeline', () => {
  describe('static formats', () => {
    it('strips camera + GPS EXIF from JPEG', async () => {
      const buf = await createJpegWithExif({
        gps: { latitude: 48.8566, longitude: 2.3522 },
      });

      const before = (await exifr.parse(buf, ['Make', 'Model'])) as Record<string, unknown> | null;
      expect(before).toBeTruthy();
      expect(before).toHaveProperty('Make');

      const stripped = await stripExifFromImage(buf, 'image/jpeg');

      expect(stripped.mime).toBe('image/jpeg');
      expect(stripped.width).toBeGreaterThan(0);
      expect(stripped.height).toBeGreaterThan(0);
      expect(await verifyExifStripped(stripped.buffer)).toBe(true);
    });

    it('strips metadata from PNG', async () => {
      const buf = await createPngWithMetadata();
      const stripped = await stripExifFromImage(buf, 'image/png');

      expect(stripped.mime).toBe('image/png');
      const meta = await sharp(stripped.buffer).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
    });

    it('strips EXIF from WebP', async () => {
      const buf = await createWebpWithExif();
      const stripped = await stripExifFromImage(buf, 'image/webp');

      expect(stripped.mime).toBe('image/webp');
      expect(await verifyExifStripped(stripped.buffer)).toBe(true);
    });
  });

  describe('animated formats — preserve animation', () => {
    it('preserves frame count for animated GIF', async () => {
      const buf = await createAnimatedGif(4);
      const inputMeta = await sharp(buf, { animated: true }).metadata();
      const inputFrames = inputMeta.pages ?? 1;

      const stripped = await stripExifFromImage(buf, 'image/gif');
      const outMeta = await sharp(stripped.buffer, { animated: true }).metadata();
      expect(stripped.mime).toBe('image/gif');
      expect(outMeta.pages ?? 1).toBeGreaterThanOrEqual(inputFrames);
    });

    it('preserves animation for animated WebP', async () => {
      const buf = await createAnimatedWebp(3);
      const inputMeta = await sharp(buf, { animated: true }).metadata();
      const inputFrames = inputMeta.pages ?? 1;
      expect(inputFrames).toBeGreaterThanOrEqual(1);

      const stripped = await stripExifFromImage(buf, 'image/webp');
      const outMeta = await sharp(stripped.buffer, { animated: true }).metadata();
      expect(stripped.mime).toBe('image/webp');
      expect(outMeta.pages ?? 1).toBeGreaterThanOrEqual(inputFrames);
    });
  });

  describe('size behaviour around the strip step', () => {
    it('accepts an image whose pre-strip size exceeds the cap if post-strip fits', async () => {
      const heavyExifBlock = 'X'.repeat(80_000);
      const big = await sharp({
        create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .withMetadata({
          exif: { IFD0: { Make: 'TestPhone', Model: 'TestModel-X', UserComment: heavyExifBlock } },
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const stripped = await stripExifFromImage(big, 'image/jpeg');

      expect(stripped.buffer.byteLength).toBeLessThan(big.byteLength);
      expect(await verifyExifStripped(stripped.buffer)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws ImageDecodeError (400, IMAGE_DECODE_FAILED) on corrupted JPEG', async () => {
      const corrupt = createCorruptJpeg();

      await expect(stripExifFromImage(corrupt, 'image/jpeg')).rejects.toBeInstanceOf(
        ImageDecodeError,
      );

      try {
        await stripExifFromImage(corrupt, 'image/jpeg');
      } catch (error) {
        expect(error).toBeInstanceOf(ImageDecodeError);
        const e = error as ImageDecodeError;
        expect(e.statusCode).toBe(400);
        expect(e.code).toBe('IMAGE_DECODE_FAILED');
      }
    });
  });

  describe('ImageProcessingService — strip BEFORE size check', () => {
    function makeFakeStorage(): ImageStorage {
      return {
        save: jest.fn(async () => 'local://stub'),
        deleteByPrefix: jest.fn(async () => undefined),
      };
    }

    it('accepts an upload whose pre-strip base64 exceeds maxImageBytes when post-strip fits', async () => {
      const heavyExifBlock = 'X'.repeat(120_000);
      const big = await (
        await import('sharp')
      )
        .default({
          create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } },
        })
        .withMetadata({
          exif: {
            IFD0: { Make: 'TestPhone', Model: 'TestModel-X', UserComment: heavyExifBlock },
          },
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const preStripBytes = big.byteLength;

      const envMod = await import('@src/config/env');
      const originalCap = envMod.env.llm.maxImageBytes;
      (envMod.env.llm as unknown as { maxImageBytes: number }).maxImageBytes = Math.floor(
        preStripBytes / 2,
      );

      const service = new ImageProcessingService({
        imageStorage: makeFakeStorage(),
        imageProcessor: new SharpImageProcessor(),
      });

      try {
        const result = await service.processImage(
          {
            source: 'upload',
            value: big.toString('base64'),
            mimeType: 'image/jpeg',
            sizeBytes: preStripBytes,
          },
          'session-test',
          1,
        );

        expect(result.imageRef).toBe('local://stub');
        expect(result.orchestratorImage.sizeBytes).toBeLessThan(preStripBytes);
        expect(result.orchestratorImage.sizeBytes).toBeLessThanOrEqual(
          envMod.env.llm.maxImageBytes,
        );
      } finally {
        (envMod.env.llm as unknown as { maxImageBytes: number }).maxImageBytes = originalCap;
      }
    });
  });

  describe('SharpImageProcessor adapter', () => {
    it('exposes a stripExif method matching the port contract', async () => {
      const processor = new SharpImageProcessor();
      const buf = await createJpegWithExif({ gps: { latitude: 1, longitude: 2 } });
      const out = await processor.stripExif(buf, 'image/jpeg');

      expect(out.mime).toBe('image/jpeg');
      expect(Buffer.isBuffer(out.buffer)).toBe(true);
      expect(await verifyExifStripped(out.buffer)).toBe(true);
    });
  });

  describe('limitInputPixels DoS guard', () => {
    it('rejects a 7000×4000 PNG (28 Mpx, above 24 Mpx cap) as ImageDecodeError', async () => {
      const oversizePng = await sharp({
        create: { width: 7000, height: 4000, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();

      await expect(stripExifFromImage(oversizePng, 'image/png')).rejects.toBeInstanceOf(
        ImageDecodeError,
      );

      try {
        await stripExifFromImage(oversizePng, 'image/png');
      } catch (error) {
        const e = error as ImageDecodeError;
        expect(e.statusCode).toBe(400);
        expect(e.code).toBe('IMAGE_DECODE_FAILED');
      }
    });

    it('accepts a typical mobile-sized 2000×1500 JPEG (3 Mpx, well under cap)', async () => {
      const okJpeg = await sharp({
        create: { width: 2000, height: 1500, channels: 3, background: { r: 10, g: 20, b: 30 } },
      })
        .jpeg({ quality: 75 })
        .toBuffer();

      const stripped = await stripExifFromImage(okJpeg, 'image/jpeg');

      expect(stripped.mime).toBe('image/jpeg');
      expect(stripped.width).toBe(2000);
      expect(stripped.height).toBe(1500);
    });
  });
});
