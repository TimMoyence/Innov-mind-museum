import sharp from 'sharp';

/**
 * SEC: 24 Mpx cap mirrors image-processing.service.ts — bounds zip-bomb DoS.
 * `failOn: 'error'` rejects malformed inputs early.
 */
const SHARP_DECODE_OPTIONS = {
  limitInputPixels: 24_000_000,
  failOn: 'error' as const,
};

/** SigLIP input: 1×3×224×224 → 150528 float32. */
const SIGLIP_INPUT_SIZE = 224;
const SIGLIP_CHANNELS = 3;

/**
 * ADR-037 — SigLIP HF processor `image_mean=image_std=[0.5,0.5,0.5]` →
 * normalise to [-1, 1] via `((x/255) - 0.5) / 0.5`. NOT ImageNet mean/std
 * (different from CLIP/ResNet/DINOv2). Wrong normalize → silent recall collapse.
 */
const SIGLIP_MEAN = 0.5;
const SIGLIP_STD = 0.5;

/**
 * Pipeline: sharp decode → removeAlpha → resize 224×224 (`fit:'fill'`, not
 * HF centre-crop — within recall budget design.md §11) → HWC uint8 →
 * SigLIP-normalise → NCHW float32.
 *
 * @returns Float32Array(150528) wrap-ready for Tensor('float32', data, [1,3,224,224]).
 * @throws sharp decode error — callers wrap as EncoderUnavailableError / IMAGE_DECODE_FAILED.
 */
export async function preprocessForSiglip(buffer: Buffer): Promise<Float32Array> {
  const { data, info } = await sharp(buffer, SHARP_DECODE_OPTIONS)
    .removeAlpha()
    .resize(SIGLIP_INPUT_SIZE, SIGLIP_INPUT_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Defensive — bail loudly on size/channel drift from sharp upgrades.
  const expectedBytes = SIGLIP_INPUT_SIZE * SIGLIP_INPUT_SIZE * SIGLIP_CHANNELS;
  if (info.channels !== SIGLIP_CHANNELS || data.length !== expectedBytes) {
    throw new Error(
      `preprocessForSiglip: unexpected sharp output ${info.width}x${info.height}x${info.channels} (${data.length} bytes), expected ${SIGLIP_INPUT_SIZE}x${SIGLIP_INPUT_SIZE}x${SIGLIP_CHANNELS} (${expectedBytes} bytes)`,
    );
  }

  const pixelCount = SIGLIP_INPUT_SIZE * SIGLIP_INPUT_SIZE;
  const tensor = new Float32Array(pixelCount * SIGLIP_CHANNELS);
  const channelOffsetR = 0;
  const channelOffsetG = pixelCount;
  const channelOffsetB = pixelCount * 2;

  // HWC uint8 → NCHW float32 in one pass; `inv255` once = small perf win.
  const inv255 = 1 / 255;
  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * SIGLIP_CHANNELS;
    const r = data[base];
    const g = data[base + 1];
    const b = data[base + 2];
    tensor[channelOffsetR + i] = (r * inv255 - SIGLIP_MEAN) / SIGLIP_STD;
    tensor[channelOffsetG + i] = (g * inv255 - SIGLIP_MEAN) / SIGLIP_STD;
    tensor[channelOffsetB + i] = (b * inv255 - SIGLIP_MEAN) / SIGLIP_STD;
  }

  return tensor;
}
