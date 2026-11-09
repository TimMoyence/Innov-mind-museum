import exifr from 'exifr';
import sharp from 'sharp';

interface JpegOptions {
  gps?: { latitude: number; longitude: number };
  orientation?: number;
  width?: number;
  height?: number;
  color?: { r: number; g: number; b: number };
}

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
  textChunk?: { keyword: string; value: string };
  width?: number;
  height?: number;
}

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
  const sharpInput = {
    raw: { width: w, height: h * frameCount, channels },
    pageHeight: h,
  } as unknown as Parameters<typeof sharp>[1];
  return await sharp(tall, sharpInput)
    .gif({ delay: Array.from({ length: frameCount }, () => 100), loop: 0 })
    .toBuffer();
}

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
  const sharpInput = {
    raw: { width: w, height: h * frameCount, channels },
    pageHeight: h,
  } as unknown as Parameters<typeof sharp>[1];
  return await sharp(tall, sharpInput).webp({ quality: 70 }).toBuffer();
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

export async function verifyExifStripped(buffer: Buffer): Promise<boolean> {
  try {
    const parsed = (await exifr.parse(buffer, [
      'Make',
      'Model',
      'GPSLatitude',
      'GPSLongitude',
      'DateTimeOriginal',
    ])) as Record<string, unknown> | null;

    if (!parsed) return true;
    return !SENSITIVE_EXIF_KEYS.some((key) => key in parsed);
  } catch {
    return true;
  }
}

export function createCorruptJpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}
