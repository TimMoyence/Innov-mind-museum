/**
 * Tests for C9.4 — `estimateCostCents` cost estimator (conservative USD pricing).
 * Spec: .claude/skills/team/team-state/2026-05-17-w1-c9-4-cost-breaker-wiring/spec.md
 *
 * Extended 2026-05-21 — RUN_ID 2026-05-21-p0-c2-cost-breaker (C2 cost breaker
 * remediation). Spec §3 R5 — image-aware cost ceiling. New describe() block at
 * the bottom couples to T2.1's `VISION_BYTES_EQUIVALENT` export.
 */

import {
  estimateCostCents,
  PRICING,
  FALLBACK_PRICING,
} from '@modules/chat/adapters/secondary/llm/llm-cost-pricing';

// IMPORT-PROBE — the constant lands in T2.1 (green phase). RED today: `undefined`.
// We probe via the namespace import so this test file compiles whether or not
// the export exists; the actual assertions enforce the green-phase contract.
import * as costPricing from '@modules/chat/adapters/secondary/llm/llm-cost-pricing';
const VISION_BYTES_EQUIVALENT_FROM_GREEN: number | undefined = (
  costPricing as unknown as { VISION_BYTES_EQUIVALENT?: number }
).VISION_BYTES_EQUIVALENT;

import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const loggerWarnMock = logger.warn as jest.MockedFunction<typeof logger.warn>;

describe('estimateCostCents', () => {
  beforeEach(() => {
    loggerWarnMock.mockReset();
  });

  describe('monotonicity', () => {
    it('more bytes => ≥ cents (never lower)', () => {
      const small = estimateCostCents(100, 'gpt-4o-mini', 800);
      const medium = estimateCostCents(1_000, 'gpt-4o-mini', 800);
      const large = estimateCostCents(10_000, 'gpt-4o-mini', 800);
      expect(medium).toBeGreaterThanOrEqual(small);
      expect(large).toBeGreaterThanOrEqual(medium);
    });

    it('larger maxOutputTokens => ≥ cents', () => {
      const lo = estimateCostCents(1_000, 'gpt-4o-mini', 200);
      const hi = estimateCostCents(1_000, 'gpt-4o-mini', 2_000);
      expect(hi).toBeGreaterThanOrEqual(lo);
    });
  });

  describe('safety bias', () => {
    it('rounds UP (Math.ceil), not down — safety bias for circuit-breaker', () => {
      // Tiny payload, tiny output → strictly positive integer (no truncation to 0
      // when the actual float cost is 0.001).
      const cents = estimateCostCents(1, 'gpt-4o-mini', 1);
      expect(cents).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(cents)).toBe(true);
    });
  });

  describe('zero floor', () => {
    it('returns 0 for non-positive payloadBytes', () => {
      expect(estimateCostCents(0, 'gpt-4o-mini', 800)).toBe(0);
      expect(estimateCostCents(-100, 'gpt-4o-mini', 800)).toBe(0);
    });

    it('returns 0 for non-finite maxOutputTokens AND zero bytes', () => {
      expect(estimateCostCents(0, 'gpt-4o-mini', Number.NaN)).toBe(0);
    });
  });

  describe('unknown model fallback', () => {
    it('warns once + applies FALLBACK_PRICING when model not in PRICING', () => {
      const cents = estimateCostCents(1_000, 'mystery-model-xyz', 800);
      expect(cents).toBeGreaterThan(0);
      expect(loggerWarnMock).toHaveBeenCalledWith(
        'llm_cost_estimate_unknown_model',
        expect.objectContaining({ model: 'mystery-model-xyz' }),
      );
    });
  });

  describe('pricing table sanity', () => {
    it('PRICING table is populated with known V1 models', () => {
      expect(PRICING['gpt-4o-mini']).toBeDefined();
      expect(PRICING['gpt-4o-mini'].inputPer1kCents).toBeGreaterThan(0);
      expect(PRICING['gpt-4o-mini'].outputPer1kCents).toBeGreaterThan(0);
    });

    it('FALLBACK_PRICING is set higher than gpt-4o-mini (safety bias)', () => {
      expect(FALLBACK_PRICING.inputPer1kCents).toBeGreaterThanOrEqual(
        PRICING['gpt-4o-mini'].inputPer1kCents,
      );
      expect(FALLBACK_PRICING.outputPer1kCents).toBeGreaterThanOrEqual(
        PRICING['gpt-4o-mini'].outputPer1kCents,
      );
    });
  });

  describe('R5 — image-aware cost ceiling (RUN_ID 2026-05-21-p0-c2-cost-breaker)', () => {
    /**
     * Spec §3 R5 — once T2.2 routes image_url items through the forfait
     * `VISION_BYTES_EQUIVALENT` (default 4000) in `estimatePayloadBytes`, the
     * post-correction payload for a single image + ~500 char text stays well
     * under the daily breaker ceiling.
     *
     * RED state: T2.1 does not export `VISION_BYTES_EQUIVALENT` yet, so the
     * coupling assertion (#1) fails on the export probe even though
     * `estimateCostCents` numerics are already passable. The regression
     * sentinel (#2) documents the inflation that motivated the run — it
     * passes today AND post-fix (it asserts what the bug LOOKED LIKE).
     */
    it('given a R4-corrected payload (1 image + 500 text), cost stays under $0.50 (50 cents)', () => {
      // Coupling assertion: the constant lands in T2.1.
      expect(typeof VISION_BYTES_EQUIVALENT_FROM_GREEN).toBe('number');
      const visionBytes = VISION_BYTES_EQUIVALENT_FROM_GREEN!;
      const correctedBytes = visionBytes + 500;
      const cents = estimateCostCents(correctedBytes, 'gpt-4o', 800);
      expect(cents).toBeLessThan(50);
    });

    it('regression sentinel: pre-R4 worst-case (5 MB image raw base64) would have charged ≥ 300 cents', () => {
      // Documents the pre-fix inflation that motivated the run. Spec §1: a
      // 5 MB image → ~1.3 M faux input tokens × $0.0025/1k (gpt-4o input
      // 0.25 cents / 1k) ⇒ ~325 cents = $3.25 PER REQUEST. Today's
      // `estimateCostCents` returns that number; post-R4 the same logical
      // image flows through `VISION_BYTES_EQUIVALENT` ⇒ ~few cents.
      // This sentinel passes today AND post-fix — it asserts what the bug
      // LOOKED like; the cure lives in the prompt-builder override, not in
      // this estimator function.
      const naiveBytes = 5_242_880; // 5 MB
      const cents = estimateCostCents(naiveBytes, 'gpt-4o', 800);
      expect(cents).toBeGreaterThanOrEqual(300);
    });
  });
});
