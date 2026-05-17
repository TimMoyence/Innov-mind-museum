/**
 * Tests for C9.4 — `estimateCostCents` cost estimator (conservative USD pricing).
 * Spec: .claude/skills/team/team-state/2026-05-17-w1-c9-4-cost-breaker-wiring/spec.md
 */

import {
  estimateCostCents,
  PRICING,
  FALLBACK_PRICING,
} from '@modules/chat/adapters/secondary/llm/llm-cost-pricing';

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
});
