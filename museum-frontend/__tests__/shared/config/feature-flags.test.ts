/**
 * RED tests for T8.7 — Frontend feature flag layer.
 *
 * SUT: `museum-frontend/shared/config/feature-flags.ts`
 *   - `getFeatureFlag(name: 'visualCompare'): boolean`     — env-only reader
 *   - `useFeatureFlag(name: 'visualCompare'): boolean`     — React hook wrapper
 *
 * Contract:
 *   - Env var `EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED` drives the flag.
 *   - 'true'  → returns true.
 *   - 'false' → returns false.
 *   - Unset / empty → DEFAULT (true) per env design (V1 launch posture).
 *   - Unknown value strings are coerced via case-insensitive 'true' match
 *     so we never silently leak a typo'd value as truthy.
 *
 * The SUT does NOT exist yet — these tests must FAIL on import.
 */
import '../../helpers/test-utils';
import { renderHook } from '@testing-library/react-native';

interface FlagApi {
  getFeatureFlag: (name: 'visualCompare') => boolean;
  useFeatureFlag: (name: 'visualCompare') => boolean;
}

// SUT reads process.env at call time (not at module init), so a single require
// is sufficient — env mutations in beforeEach propagate to the next call.
// We deliberately do NOT call jest.resetModules() here: re-requiring the SUT
// would also re-evaluate its `import { useMemo } from 'react'`, yielding a
// React instance distinct from the one used by `renderHook` imported at the
// top of this file. Two React instances ⇒ dispatcher mismatch ⇒
// "Cannot read properties of null (reading 'useMemoCache')" from the React
// Compiler runtime.
const loadModule = (): FlagApi =>
  require('@/shared/config/feature-flags') as FlagApi;

describe('feature-flags (T8.7)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('getFeatureFlag()', () => {
    it('returns true when EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED="true"', () => {
      process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED = 'true';
      const { getFeatureFlag } = loadModule();
      expect(getFeatureFlag('visualCompare')).toBe(true);
    });

    it('returns false when EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED="false"', () => {
      process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED = 'false';
      const { getFeatureFlag } = loadModule();
      expect(getFeatureFlag('visualCompare')).toBe(false);
    });

    it('defaults to true when the env var is unset (V1 launch default)', () => {
      delete process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED;
      const { getFeatureFlag } = loadModule();
      expect(getFeatureFlag('visualCompare')).toBe(true);
    });

    it('treats an unknown / typo value as the default (true) rather than truthy-coerced', () => {
      // Defensive contract: anything other than a clean 'false' lowercase string
      // collapses to the default. Avoids leaking an off flag from a typo like
      // EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED="ture".
      process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED = 'ture';
      const { getFeatureFlag } = loadModule();
      expect(getFeatureFlag('visualCompare')).toBe(true);
    });

    it('is case-insensitive on the explicit "false" disable value', () => {
      process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED = 'FALSE';
      const { getFeatureFlag } = loadModule();
      expect(getFeatureFlag('visualCompare')).toBe(false);
    });
  });

  describe('useFeatureFlag()', () => {
    it('returns true when env var is "true"', () => {
      process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED = 'true';
      const { useFeatureFlag } = loadModule();
      const { result } = renderHook(() => useFeatureFlag('visualCompare'));
      expect(result.current).toBe(true);
    });

    it('returns false when env var is "false"', () => {
      process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED = 'false';
      const { useFeatureFlag } = loadModule();
      const { result } = renderHook(() => useFeatureFlag('visualCompare'));
      expect(result.current).toBe(false);
    });

    it('returns the default (true) when env var is unset', () => {
      delete process.env.EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED;
      const { useFeatureFlag } = loadModule();
      const { result } = renderHook(() => useFeatureFlag('visualCompare'));
      expect(result.current).toBe(true);
    });
  });
});
