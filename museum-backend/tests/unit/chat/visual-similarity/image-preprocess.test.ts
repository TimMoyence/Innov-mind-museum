/**
 * RED — T4.1 — `preprocessForSiglip` shape / dtype / range / decoding.
 *
 * The SUT (`image-preprocess.ts`) does not yet exist; these tests intentionally
 * fail at module-resolution time until Phase 4 implementation lands. They lock
 * down the contract spelled out in tasks.md T4.1 and design.md §3 — sharp
 * resize 224×224, RGB float32, ImageNet-style SigLIP normalisation
 * (mean [0.5,0.5,0.5], std [0.5,0.5,0.5]), shape `[1, 3, 224, 224]`.
 */

import {
  makeCorruptBuffer,
  makeSiglipJpegBuffer,
  makeSiglipPngBuffer,
  makeSiglipWebpBuffer,
} from '../../../helpers/chat/visual-similarity/image-fixtures';

// SUT — does not yet exist (Phase 4 implementation). Import is intentional:
// it must resolve once the editor lands the file. RED until then.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load to surface a useful Jest failure when the module is missing
const { preprocessForSiglip } =
  require('@modules/chat/adapters/secondary/embeddings/image-preprocess') as {
    preprocessForSiglip: (buffer: Buffer) => Promise<Float32Array>;
  };

/** SigLIP-base-patch16-224 input: batch=1, channels=3, H=224, W=224. */
const SIGLIP_TENSOR_LENGTH = 1 * 3 * 224 * 224;

describe('preprocessForSiglip (T4.1)', () => {
  let jpegBuffer: Buffer;
  let pngBuffer: Buffer;
  let webpBuffer: Buffer;

  beforeAll(async () => {
    jpegBuffer = await makeSiglipJpegBuffer();
    pngBuffer = await makeSiglipPngBuffer();
    webpBuffer = await makeSiglipWebpBuffer();
  });

  it('returns a Float32Array of length 1*3*224*224 (=150528)', async () => {
    const tensor = await preprocessForSiglip(jpegBuffer);
    expect(tensor).toBeInstanceOf(Float32Array);
    expect(tensor.length).toBe(SIGLIP_TENSOR_LENGTH);
  });

  it('produces values within the ImageNet-normalised range [-1, 1] (±0.05 tolerance)', async () => {
    const tensor = await preprocessForSiglip(jpegBuffer);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of tensor) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // SigLIP HF processor uses mean=[0.5,0.5,0.5], std=[0.5,0.5,0.5].
    // For a uint8 pixel x in [0,255]: (x/255 - 0.5)/0.5 lies in [-1, 1].
    expect(min).toBeGreaterThanOrEqual(-1.05);
    expect(max).toBeLessThanOrEqual(1.05);
  });

  it('accepts a JPEG buffer', async () => {
    const tensor = await preprocessForSiglip(jpegBuffer);
    expect(tensor.length).toBe(SIGLIP_TENSOR_LENGTH);
  });

  it('accepts a PNG buffer (alpha channel dropped)', async () => {
    const tensor = await preprocessForSiglip(pngBuffer);
    expect(tensor.length).toBe(SIGLIP_TENSOR_LENGTH);
  });

  it('accepts a WebP buffer', async () => {
    const tensor = await preprocessForSiglip(webpBuffer);
    expect(tensor.length).toBe(SIGLIP_TENSOR_LENGTH);
  });

  it('throws on a corrupt buffer (no valid image magic header)', async () => {
    const corrupt = makeCorruptBuffer();
    await expect(preprocessForSiglip(corrupt)).rejects.toThrow();
  });

  // P0 #3 (audit F4 §Claim 4) — decompression-bomb DoS guard. Mirrors the
  // `limitInputPixels` cap added in `image-processing.service.ts` so the
  // SigLIP path can't be exploited as a parallel attack vector.
  it('rejects an oversized image (>24 Mpx) before tensor allocation', async () => {
    const sharp = (await import('sharp')).default;
    const oversize = await sharp({
      create: { width: 7000, height: 4000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    await expect(preprocessForSiglip(oversize)).rejects.toThrow();
  });
});
