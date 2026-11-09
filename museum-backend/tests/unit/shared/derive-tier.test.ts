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
    expect(deriveTier(0)).toBe('free');
  });
});
