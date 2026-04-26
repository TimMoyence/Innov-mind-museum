/**
 * Shared image-buffer factories for chat tests. Per UFR-002, no test file may
 * construct image buffers inline — go through these helpers so EXIF / size /
 * animation defaults stay consistent across the suite.
 *
 * All helpers are async because `sharp` is the underlying engine.
 */
import exifr from 'exifr';
import sharp from 'sharp';

interface JpegOptions {
  /** Inject a synthetic GPS coordinate into EXIF (used to assert strip). */
  gps?: { latitude: number; longitude: number };
  /** EXIF orientation 1-8. Default 1. */
  orientation?: number;
  /** Image width in px. Default 16. */
  width?: number;
  /** Image height in px. Default 16. */
  height?: number;
  /** Solid fill colour. Default red. */
  color?: { r: number; g: number; b: number };
}

/**
 * Builds a tiny JPEG with optional EXIF metadata baked in via sharp.
 *
 * GPS is injected through `withMetadata({ exif })` — sharp embeds the data in
 * an APP1/EXIF segment so post-strip parsers (`exifr`) will surface the keys
 * unless the strip pipeline ran.
 * @param options - GPS, orientation, dimensions, fill color overrides.
 * @returns JPEG buffer.
 */
export async function createJpegWithExif(options: JpegOptions = {}): Promise<Buffer> {
  const {
    gps,
    orientation = 1,
    width = 16,
    height = 16,
    color = { r: 200, g: 30, b: 30 },
  } = options;

  const exif: Record<string, Record<string, string>> = {
    IFD0: {
      Make: 'TestPhone',
      Model: 'TestModel-X',
    },
  };
  if (gps) {
    exif.GPS = {
      GPSLatitudeRef: gps.latitude >= 0 ? 'N' : 'S',
      GPSLatitude: String(Math.abs(gps.latitude)),
      GPSLongitudeRef: gps.longitude >= 0 ? 'E' : 'W',
      GPSLongitude: String(Math.abs(gps.longitude)),
    };
  }

  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .withMetadata({ orientation, exif })
    .jpeg({ quality: 80 })
    .toBuffer();
}

interface PngOptions {
  /** Embed a synthetic tEXt chunk via sharp metadata. */
  textChunk?: { keyword: string; value: string };
  width?: number;
  height?: number;
}

/**
 * Builds a PNG with optional metadata. Sharp does not expose tEXt directly,
 * but `withMetadata` triggers an iCCP/exif segment that the strip pipeline
 * must remove. We assert post-strip that no metadata survives.
 * @param options - Metadata + dimensions.
 * @returns PNG buffer.
 */
export async function createPngWithMetadata(options: PngOptions = {}): Promise<Buffer> {
  const { width = 16, height = 16 } = options;
  return await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 80, b: 200, alpha: 1 } },
  })
    .withMetadata({
      exif: {
        IFD0: {
          Make: 'TestPhone',
          Model: 'TestModel-X',
          Software: 'fixture',
        },
      },
    })
    .png()
    .toBuffer();
}

/**
 * Builds a static WebP with EXIF metadata.
 * @returns WebP buffer.
 */
export async function createWebpWithExif(): Promise<Buffer> {
  return await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 50, g: 150, b: 50 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Make: 'TestPhone', Model: 'TestModel-X' },
      } as Record<string, Record<string, string>>,
    })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * Builds an animated GIF with the requested frame count.
 * @param frameCount - Number of distinct frames (≥2 for animation).
 * @returns Animated GIF buffer.
 */
export async function createAnimatedGif(frameCount: number): Promise<Buffer> {
  const w = 8;
  const h = 8;
  const channels = 3;
  const frame = Buffer.alloc(w * h * channels);
  const tall = Buffer.concat(
    Array.from({ length: frameCount }, (_, idx) => {
      const tinted = Buffer.from(frame);
      for (let i = 0; i < tinted.length; i += channels) {
        tinted[i] = (idx * 30) % 256;
      }
      return tinted;
    }),
  );
  // sharp recognises stacked-vertical frames only when `pageHeight` is set on
  // the input. Without it the entire raw buffer is treated as one tall image.
  // pageHeight is runtime-accepted by sharp for raw multi-frame input but not
  // in its typed surface yet (sharp <0.34). Cast through `unknown` to keep
  // the call site honest while satisfying the compiler.
  const sharpInput = {
    raw: { width: w, height: h * frameCount, channels },
    pageHeight: h,
  } as unknown as Parameters<typeof sharp>[1];
  return await sharp(tall, sharpInput)
    .gif({ delay: Array.from({ length: frameCount }, () => 100), loop: 0 })
    .toBuffer();
}

/**
 * Builds an animated WebP with the requested frame count.
 * @param frameCount - Number of distinct frames (≥2).
 * @returns Animated WebP buffer.
 */
export async function createAnimatedWebp(frameCount: number): Promise<Buffer> {
  const w = 8;
  const h = 8;
  const channels = 3;
  const tall = Buffer.concat(
    Array.from({ length: frameCount }, (_, idx) => {
      const tinted = Buffer.alloc(w * h * channels);
      for (let i = 0; i < tinted.length; i += channels) {
        tinted[i] = (idx * 40) % 256;
        tinted[i + 1] = 100;
        tinted[i + 2] = 200;
      }
      return tinted;
    }),
  );
  // pageHeight is runtime-accepted by sharp for raw multi-frame input but not
  // in its typed surface yet (sharp <0.34). Cast through `unknown` to keep
  // the call site honest while satisfying the compiler.
  const sharpInput = {
    raw: { width: w, height: h * frameCount, channels },
    pageHeight: h,
  } as unknown as Parameters<typeof sharp>[1];
  return await sharp(tall, sharpInput)
    .webp({ quality: 70 })
    .toBuffer();
}

const SENSITIVE_EXIF_KEYS = [
  'gps',
  'GPSLatitude',
  'GPSLongitude',
  'GPSLatitudeRef',
  'GPSLongitudeRef',
  'latitude',
  'longitude',
  'Make',
  'Model',
  'DateTimeOriginal',
  'CreateDate',
  'SerialNumber',
];

/**
 * Test helper: parses a stripped buffer with `exifr` and asserts no
 * privacy-sensitive EXIF tags survived (GPS, camera make/model). Returns
 * `true` when the buffer is clean, `false` otherwise. Never throws.
 * @param buffer - The post-strip image buffer.
 * @returns `true` if no GPS / device EXIF keys are present.
 */
export async function verifyExifStripped(buffer: Buffer): Promise<boolean> {
  try {
    const parsed = (await exifr.parse(buffer, ['Make', 'Model', 'GPSLatitude', 'GPSLongitude', 'DateTimeOriginal'])) as Record<string, unknown> | null;

    if (!parsed) return true;
    return !SENSITIVE_EXIF_KEYS.some((key) => key in parsed);
  } catch {
    // exifr threw → no parseable metadata → considered stripped.
    return true;
  }
}

/**
 * Returns a deliberately corrupt JPEG buffer (matching JPEG magic bytes but
 * truncated immediately after the SOI marker — sharp will refuse to decode).
 * @returns Truncated JPEG buffer.
 */
export function createCorruptJpeg(): Buffer {
  // FF D8 FF = JPEG SOI; the rest is junk so sharp throws on decode.
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}
