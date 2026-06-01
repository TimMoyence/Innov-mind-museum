/**
 * RED — W1-D1FE-01 / M6.
 *
 * Pure decision module (no React, no expo). Given a resolved DataMode and
 * whether WebP encoding is supported on this platform, it yields the
 * compression profile(s) to apply:
 *
 * - low/edge  → TWO outputs: a small upload (~1024px WebP q~0.60 ~150KB) AND a
 *               larger localDerivative (~1280px WebP q~0.70 250-400KB) handed to
 *               the carnet (cluster E).
 * - normal    → the LEGACY single output (1600px JPEG 2.7MB, no derivative).
 * - webpSupported=false → upload falls back to JPEG q~0.55 @1024 (~220KB).
 *
 * The module does not exist yet — this import fails the suite (RED).
 */
import { decideCompression } from '@/features/chat/application/compressionDecision.pure';

describe('decideCompression (pure)', () => {
  it('low → upload (1024 WebP q~0.60 ~150KB) + localDerivative (1280 WebP q~0.70 250-400KB)', () => {
    const decision = decideCompression('low', true);

    expect(decision.upload.maxDimensionPx).toBe(1024);
    expect(decision.upload.format).toBe('webp');
    expect(decision.upload.quality).toBeGreaterThanOrEqual(0.55);
    expect(decision.upload.quality).toBeLessThanOrEqual(0.65);
    expect(decision.upload.targetBytes).toBeGreaterThanOrEqual(120_000);
    expect(decision.upload.targetBytes).toBeLessThanOrEqual(180_000);

    expect(decision.localDerivative).toBeDefined();
    const derivative = decision.localDerivative;
    if (!derivative) throw new Error('expected localDerivative to be defined');
    expect(derivative.maxDimensionPx).toBe(1280);
    expect(derivative.format).toBe('webp');
    expect(derivative.quality).toBeGreaterThanOrEqual(0.65);
    expect(derivative.quality).toBeLessThanOrEqual(0.75);
    expect(derivative.targetBytes).toBeGreaterThanOrEqual(250_000);
    expect(derivative.targetBytes).toBeLessThanOrEqual(400_000);
  });

  it('normal → legacy single output (1600 JPEG 2.7MB), no localDerivative', () => {
    const decision = decideCompression('normal', true);

    expect(decision.upload.maxDimensionPx).toBe(1600);
    expect(decision.upload.format).toBe('jpeg');
    expect(decision.upload.targetBytes).toBe(2_700_000);
    expect(decision.localDerivative).toBeUndefined();
  });

  it('low + webpSupported=false → upload falls back to JPEG q~0.55 @1024', () => {
    const decision = decideCompression('low', false);

    expect(decision.upload.format).toBe('jpeg');
    expect(decision.upload.maxDimensionPx).toBe(1024);
    expect(decision.upload.quality).toBeGreaterThanOrEqual(0.5);
    expect(decision.upload.quality).toBeLessThanOrEqual(0.6);
  });

  it('low fallback localDerivative also uses JPEG when webp unsupported', () => {
    const decision = decideCompression('low', false);

    const derivative = decision.localDerivative;
    if (!derivative) throw new Error('expected localDerivative to be defined');
    expect(derivative.format).toBe('jpeg');
  });
});
