import sharp from 'sharp';

const SHARP_DECODE_OPTIONS = {
  limitInputPixels: 24_000_000,
  failOn: 'error' as const,
};

const SIGLIP_INPUT_SIZE = 224;
const SIGLIP_CHANNELS = 3;

const SIGLIP_MEAN = 0.5;
const SIGLIP_STD = 0.5;

export async function preprocessForSiglip(buffer: Buffer): Promise<Float32Array> {
  const { data, info } = await sharp(buffer, SHARP_DECODE_OPTIONS)
    .removeAlpha()
    .resize(SIGLIP_INPUT_SIZE, SIGLIP_INPUT_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

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
