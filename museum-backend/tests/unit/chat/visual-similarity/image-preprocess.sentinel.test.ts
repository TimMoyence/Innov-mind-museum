import sharp from 'sharp';

import { preprocessForSiglip } from '@modules/chat/adapters/secondary/embeddings/image-preprocess';

describe('preprocessForSiglip — normalize sentinel (C9.14)', () => {
  it('maps a white pixel (255) to 1.0 (mean=0.5, std=0.5) across all 3 channels', async () => {
    const whitePng = await sharp({
      create: {
        width: 224,
        height: 224,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const tensor = await preprocessForSiglip(whitePng);

    expect(tensor.length).toBe(1 * 3 * 224 * 224);
    expect(tensor[0]).toBeCloseTo(1.0, 6);
    expect(tensor[224 * 224]).toBeCloseTo(1.0, 6);
    expect(tensor[224 * 224 * 2]).toBeCloseTo(1.0, 6);
  });

  it('maps a black pixel (0) to -1.0 (mean=0.5, std=0.5)', async () => {
    const blackPng = await sharp({
      create: {
        width: 224,
        height: 224,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const tensor = await preprocessForSiglip(blackPng);
    expect(tensor[0]).toBeCloseTo(-1.0, 6);
    expect(tensor[224 * 224]).toBeCloseTo(-1.0, 6);
    expect(tensor[224 * 224 * 2]).toBeCloseTo(-1.0, 6);
  });
});
