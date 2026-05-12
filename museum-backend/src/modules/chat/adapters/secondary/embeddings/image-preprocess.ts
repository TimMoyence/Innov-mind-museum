import sharp from 'sharp';

/**
 * SigLIP-base-patch16-224 input contract:
 * - batch = 1
 * - channels = 3 (RGB, alpha dropped)
 * - height = 224
 * - width = 224
 *
 * The exported tensor has length `1 * 3 * 224 * 224 = 150528` float32 values.
 */
const SIGLIP_INPUT_SIZE = 224;
const SIGLIP_CHANNELS = 3;

/**
 * SigLIP HF processor config (`google/siglip-base-patch16-224`):
 * `image_mean = [0.5, 0.5, 0.5]`, `image_std = [0.5, 0.5, 0.5]`.
 * For a uint8 pixel `x ∈ [0, 255]`, the normalised value is
 * `((x / 255) - 0.5) / 0.5` which lives in `[-1, 1]`.
 */
const SIGLIP_MEAN = 0.5;
const SIGLIP_STD = 0.5;

/**
 * Resizes / re-encodes an arbitrary image buffer (JPEG, PNG, WebP, …) into the
 * `Float32Array` tensor expected by the SigLIP-base-patch16-224 ONNX model.
 *
 * Pipeline:
 * 1. `sharp` auto-detects the input format (JPEG / PNG / WebP / GIF / …) and
 *    decodes it. Alpha is dropped via `removeAlpha()` so PNG / RGBA inputs
 *    surface as flat RGB without transparency leaks.
 * 2. Resize to 224×224 using `fit: 'fill'` so the encoder receives the exact
 *    geometry it was trained on. SigLIP's HF processor performs an
 *    aspect-ratio-preserving resize + centre-crop, but for the V1 adapter we
 *    keep the simpler `fill` strategy — empirically within recall budget on
 *    the held-out set documented in design.md §11.
 * 3. Extract raw bytes via `.raw().toBuffer()` — that gives us interleaved
 *    HWC uint8 (`[R0,G0,B0, R1,G1,B1, …]`).
 * 4. Convert each channel to float32, normalise via SigLIP mean/std (so each
 *    pixel ends up in roughly `[-1, 1]`) and rewrite into NCHW layout
 *    (`[R0,R1,…, G0,G1,…, B0,B1,…]`) — that's what `onnxruntime` consumes for
 *    the `pixel_values` input.
 *
 * @param buffer - Raw image bytes. Format auto-detected by sharp.
 * @returns A `Float32Array` of length `150528` in NCHW layout, ready to wrap
 *   in an ONNX `Tensor('float32', data, [1, 3, 224, 224])`.
 * @throws {Error} Propagates sharp's decoding error when the buffer is not a
 *   valid image (corrupt header, truncated stream, unsupported format).
 *   Callers in the embeddings adapter wrap this into `EncoderUnavailableError`
 *   / `IMAGE_DECODE_FAILED` as appropriate.
 */
export async function preprocessForSiglip(buffer: Buffer): Promise<Float32Array> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .resize(SIGLIP_INPUT_SIZE, SIGLIP_INPUT_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Defensive: sharp must yield exactly 224×224×3 bytes after the pipeline
  // above. If it doesn't (e.g. unexpected channel count after a future
  // sharp upgrade), bail out loudly rather than silently corrupting the
  // tensor.
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

  // sharp emits HWC interleaved uint8 — reshape to NCHW float32 in a single
  // pass. Inverting `255` once instead of dividing per-pixel is a tiny perf
  // win on a 50k-iteration loop.
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
