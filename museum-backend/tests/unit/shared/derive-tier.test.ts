/**
 * TD-20 [T0.1] RED — `deriveTier` shared helper (AC A11, R12).
 *
 * Asserts the helper exists and applies the orchestrator's tier rule verbatim
 * (`langchain.orchestrator.ts:325-326`: `userId == null ? 'anonymous' : 'free'`).
 * RED: the module does not exist yet → import fails → suite fails.
 *
 * No Langfuse import here; pure logic. No factories needed (scalar inputs).
 */
import { deriveTier } from '@shared/observability/derive-tier';

describe('deriveTier (TD-20 — DRY tier rule, R12/A11)', () => {
  it("returns 'free' for a present userId", () => {
    expect(deriveTier(42)).toBe('free');
  });

  it("returns 'anonymous' for undefined userId", () => {
    expect(deriveTier(undefined)).toBe('anonymous');
  });

  it("returns 'anonymous' for null userId", () => {
    expect(deriveTier(null)).toBe('anonymous');
  });

  it("returns 'free' for userId 0 only if 0 is a real id (== null is false for 0)", () => {
    // `0 == null` is false, so the orchestrator rule classifies 0 as 'free'.
    // Documenting parity with `userId == null ? 'anonymous' : 'free'`.
    expect(deriveTier(0)).toBe('free');
  });
});
