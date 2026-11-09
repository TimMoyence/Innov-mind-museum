import sharp from 'sharp';

interface SiglipImageOptions {
  width?: number;
  height?: number;
  color?: { r: number; g: number; b: number };
}

export async function makeSiglipJpegBuffer(options: SiglipImageOptions = {}): Promise<Buffer> {
  const { width = 224, height = 224, color = { r: 128, g: 128, b: 128 } } = options;
  return await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function makeSiglipPngBuffer(options: SiglipImageOptions = {}): Promise<Buffer> {
  const { width = 224, height = 224, color = { r: 50, g: 100, b: 200 } } = options;
  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: color.r, g: color.g, b: color.b, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

export async function makeSiglipWebpBuffer(options: SiglipImageOptions = {}): Promise<Buffer> {
  const { width = 224, height = 224, color = { r: 50, g: 200, b: 80 } } = options;
  return await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .webp({ quality: 90 })
    .toBuffer();
}

export function makeCorruptBuffer(): Buffer {
  return Buffer.from('this is not an image — random bytes 0xDEADBEEF', 'utf8');
}
