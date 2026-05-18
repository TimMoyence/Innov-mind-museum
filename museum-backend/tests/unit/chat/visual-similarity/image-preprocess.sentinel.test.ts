/**
 * Normalize-math sentinel for SigLIP-family preprocessing.
 *
 * SigLIP / SigLIP-2 require `(pixel/255 - 0.5) / 0.5` ≡ `(pixel/127.5) - 1.0` →
 * range [-1, 1] (mean=0.5, std=0.5). This is NOT the ImageNet mean/std used by
 * CLIP / ResNet / DINOv2. Wrong normalize silently produces valid-looking
 * embeddings with catastrophic recall (CLAUDE.md gotcha). This sentinel pins
 * the math against a synthetic white pixel: input 255 → output (255/255 - 0.5)
 * / 0.5 = 1.0. Any drift to ImageNet (`(1 - 0.485) / 0.229 ≈ 2.249` for R)
 * fails the assertion loudly.
 */

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
    // White pixel after `(1 - 0.5) / 0.5` = 1.0 exactly. Sample one
    // component per channel; resize/fill cannot drift channel boundaries.
    expect(tensor[0]).toBeCloseTo(1.0, 6);
    expect(tensor[224 * 224]).toBeCloseTo(1.0, 6); // green channel offset
    expect(tensor[224 * 224 * 2]).toBeCloseTo(1.0, 6); // blue channel offset
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
    // Black: (0 - 0.5) / 0.5 = -1.0. ImageNet would give -2.118 (catches drift).
    expect(tensor[0]).toBeCloseTo(-1.0, 6);
    expect(tensor[224 * 224]).toBeCloseTo(-1.0, 6);
    expect(tensor[224 * 224 * 2]).toBeCloseTo(-1.0, 6);
  });
});
