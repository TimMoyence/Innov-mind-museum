/**
 * Shared image-buffer factories for the visual-similarity test suite.
 *
 * Per CLAUDE.md test discipline (UFR-002), no test file may build a JPEG /
 * PNG / WebP buffer inline — those go through the helpers below so dimension
 * + colour defaults stay aligned with the SigLIP preprocessing pipeline
 * (224×224 RGB, ImageNet-style normalisation).
 *
 * The chat-level `image-fixtures.ts` file targets the EXIF-strip pipeline and
 * builds tiny 16×16 buffers; the SigLIP encoder needs at least 224×224, so
 * we keep the helpers separate rather than parametrising the existing ones.
 */
import sharp from 'sharp';

interface SiglipImageOptions {
  /** Image width in px. Default 224 (matches SigLIP-base patch16-224). */
  width?: number;
  /** Image height in px. Default 224. */
  height?: number;
  /** Solid fill colour. Default mid-grey so post-normalise vector stays bounded. */
  color?: { r: number; g: number; b: number };
}

/**
 * Builds a JPEG buffer suitable for {@link preprocessForSiglip}.
 *
 * Defaults to a 224×224 mid-grey RGB image — SigLIP-base accepts that
 * straight through without resize, so tests can assert preprocessing
 * invariants (shape, dtype, range) deterministically.
 * @param options - Width / height / fill colour overrides.
 * @returns Promise resolving to the JPEG bytes.
 */
export async function makeSiglipJpegBuffer(
  options: SiglipImageOptions = {},
): Promise<Buffer> {
  const { width = 224, height = 224, color = { r: 128, g: 128, b: 128 } } = options;
  return await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Builds a PNG buffer suitable for {@link preprocessForSiglip}.
 *
 * RGBA-aware (sharp default for PNG) — the preprocessor must drop alpha
 * before tensor packing. Default 224×224 fill colour mid-blue.
 * @param options - Width / height / fill colour overrides.
 * @returns Promise resolving to the PNG bytes.
 */
export async function makeSiglipPngBuffer(
  options: SiglipImageOptions = {},
): Promise<Buffer> {
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

/**
 * Builds a WebP buffer suitable for {@link preprocessForSiglip}.
 *
 * Default 224×224 fill colour mid-green.
 * @param options - Width / height / fill colour overrides.
 * @returns Promise resolving to the WebP bytes.
 */
export async function makeSiglipWebpBuffer(
  options: SiglipImageOptions = {},
): Promise<Buffer> {
  const { width = 224, height = 224, color = { r: 50, g: 200, b: 80 } } = options;
  return await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .webp({ quality: 90 })
    .toBuffer();
}

/**
 * Returns a deliberately corrupt buffer — the bytes do not match any image
 * magic header so any decoder (sharp, ONNX preprocess, …) MUST reject it.
 * @returns Buffer with random non-image bytes.
 */
export function makeCorruptBuffer(): Buffer {
  return Buffer.from('this is not an image — random bytes 0xDEADBEEF', 'utf8');
}
