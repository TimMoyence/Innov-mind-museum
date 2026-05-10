/**
 * Frontend feature-flag layer (T8.7 — Phase 8 / C3 Image Comparative).
 *
 * V1-launch posture: flags are env-driven only (no remote-config service yet)
 * and DEFAULT TO ENABLED. To explicitly disable a flag, set the env var to
 * the string `"false"` (case-insensitive). Anything else — including a typo'd
 * value like `"ture"` or an empty string — collapses to the default so a
 * fat-finger never accidentally ships a feature in the off state.
 *
 * Adding a new flag:
 *   1. Extend the `FeatureFlagName` union below.
 *   2. Add a row to `FLAG_ENV_VARS` mapping the flag name to its
 *      `EXPO_PUBLIC_FEATURE_*` env var (Expo public env vars are the only
 *      ones available at runtime in RN bundles).
 *   3. Document the env var in `.env.example`.
 *
 * NB: `process.env.EXPO_PUBLIC_*` is inlined at bundle time by Metro/Babel,
 * so changing the value requires a rebuild (no hot reload). Tests bypass this
 * by reading `process.env` at module-eval time and using `jest.resetModules()`
 * between cases — see `__tests__/shared/config/feature-flags.test.ts`.
 */
import { useMemo } from 'react';

/** Names of all known feature flags. Extend the union when adding a flag. */
export type FeatureFlagName = 'visualCompare';

/** Env-var name carrying each flag's runtime value. */
const FLAG_ENV_VARS: Record<FeatureFlagName, string> = {
  visualCompare: 'EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED',
};

/**
 * Default value when the env var is unset / empty / unrecognised.
 *
 * V1 launch posture: every flag defaults to enabled. The only way to turn a
 * flag OFF is to set its env var to the explicit string `"false"`. This guards
 * against a typo (`EXPO_PUBLIC_FEATURE_VISUAL_COMPARE_ENABLED="ture"`)
 * silently disabling a feature that is supposed to ship.
 */
const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  visualCompare: true,
};

/**
 * Reads the raw env value for a flag and resolves it to a boolean.
 *
 * Resolution rules (intentionally narrow):
 *   - Explicit lowercase or uppercase `"false"` → returns `false`.
 *   - Lowercase or uppercase `"true"` → returns `true`.
 *   - Anything else (unset, empty, typo) → returns the configured default.
 *
 * @param name - The feature flag to read.
 * @returns The resolved boolean value of the flag.
 */
export const getFeatureFlag = (name: FeatureFlagName): boolean => {
  const envVar = FLAG_ENV_VARS[name];
  const defaultValue = FLAG_DEFAULTS[name];
  const raw = process.env[envVar];

  if (typeof raw !== 'string' || raw.length === 0) {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'false') {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }
  return defaultValue;
};

/**
 * React hook wrapper around {@link getFeatureFlag}. Memoised so the boolean
 * identity is stable across re-renders (consumers can use it as an effect
 * dependency without churn).
 *
 * Note: `process.env.EXPO_PUBLIC_*` is bundle-time-frozen in RN, so the value
 * cannot change during a session — `useMemo` over `[name]` is sufficient.
 *
 * @param name - The feature flag to subscribe to.
 * @returns The resolved boolean value of the flag.
 */
export const useFeatureFlag = (name: FeatureFlagName): boolean => {
  // The env var is frozen at bundle time, so [name] is the only meaningful
  // dependency; we still wrap in useMemo to give consumers a stable identity.
  return useMemo(() => getFeatureFlag(name), [name]);
};
