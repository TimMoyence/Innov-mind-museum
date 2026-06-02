// e2e-skip: dev-only deterministic low-data trigger route for W3 Maestro netshape flows; no user happy-path
import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';

/**
 * W1-DEV-01 — Dev-only Maestro trigger route for the low-data mode.
 *
 * iOS simulators cannot have their NetInfo connection type forced, so the
 * low-data banner (driven by `resolveDataMode(preference === 'low')`) never
 * lights deterministically in CI. This route mutates the REAL
 * `useDataModePreferenceStore` to a forced preference, then redirects home so
 * the next screen renders under the chosen data mode — deterministic for W3
 * Maestro netshape flows.
 *
 * Reachable via deeplink `musaium:///(dev)/force-data-mode?value=low`
 * (default `low`; `?value=normal` forces the normal path). Gated on `__DEV__`
 * both here (defense-in-depth, before any store mutation) and by the parent
 * `(dev)/_layout.tsx`, so it is unreachable in a release bundle.
 *
 * Self-resets the preference back to `'auto'` on unmount so a forced mode does
 * not leak into the next flow sharing the same simulator session (R6 no-leak).
 *
 * See `.maestro/MODAL_FLOWS_NOTES.md` for the deeplink contract.
 */
export default function ForceDataModeRoute() {
  // Hooks must run unconditionally (rules-of-hooks); the release-bundle guard is
  // applied to the render output below and to the store mutation inside the
  // effect, so NO store write ever happens outside `__DEV__` (R4).
  const { value } = useLocalSearchParams<{ value?: 'low' | 'normal' }>();
  const forced = value === 'normal' ? 'normal' : 'low';

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    // Forced preference applied at mount for the deterministic deeplink trigger;
    // cleanup resets to `'auto'` (R6 no-leak across same-sim flows).
    useDataModePreferenceStore.getState().setPreference(forced);
    return () => {
      useDataModePreferenceStore.getState().setPreference('auto');
    };
  }, [forced]);

  // Defense-in-depth: in a release bundle this route is unreachable (parent
  // `(dev)/_layout.tsx` already redirects); render redirects home regardless.
  return <Redirect href="/" />;
}
